const User = require('../models/user');
const IntegrationConnection = require('../models/integrationConnection');
const env = require('../config/env');
const {
  isConfigured: encryptionConfigured,
  encryptSecret,
} = require('../utils/secretBox');
const { signOAuthState, verifyOAuthState } = require('../utils/oauthState');
const {
  exchangeCode,
  getPageAccounts,
  subscribePage,
  verifyWhatsAppAccount,
} = require('../services/providers/graphClient');
const { createRateLimiter } = require('../middleware/rateLimit');

const connectLimiter = createRateLimiter({
  windowMs: 10 * 60_000,
  max: 20,
  keyGenerator: (req) => `connect:${req.userId || req.ip}`,
  message: 'Too many connection attempts. Please wait a few minutes.',
});

const META_SCOPES = [
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_metadata',
  'pages_messaging',
  'instagram_basic',
  'instagram_manage_messages',
  'business_management',
];

function integrationRedirect(params = {}) {
  const url = new URL('/integrations', env.frontendUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

function metaOAuthConfigured() {
  return Boolean(env.metaAppId && env.metaAppSecret && env.metaOAuthRedirectUri);
}

/** GET /api/integrations/status — safe connection state for the UI. */
exports.status = async (req, res) => {
  try {
    const [user, connections] = await Promise.all([
      User.findById(req.userId).select('googleEmail googleRefreshToken whatsappPhoneNumberId'),
      IntegrationConnection.find({ userId: req.userId }).sort({ createdAt: 1 }),
    ]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      gmail: {
        connected: !!(user.googleRefreshToken && user.googleEmail),
        email: user.googleEmail || null,
        pushConfigured: Boolean(env.googlePubsubTopic),
        oauthConfigured: env.gmailConfigured,
      },
      whatsappLegacyPhoneNumberId: user.whatsappPhoneNumberId || null,
      connections: connections.map((c) => c.toSafeJSON()),
      setup: {
        encryptionConfigured: encryptionConfigured(),
        gmailOAuthConfigured: env.gmailConfigured,
        metaOAuthConfigured: metaOAuthConfigured(),
        metaWebhookConfigured: Boolean(env.metaVerifyToken && env.metaAppSecret),
        gmailPushConfigured: Boolean(env.googlePubsubTopic),
        gmailPushVerificationConfigured: Boolean(env.googlePubsubAudience || env.googlePubsubToken),
      },
    });
  } catch (err) {
    console.error('❌ Integration status error:', err.message);
    res.status(500).json({ error: 'Could not load integration status' });
  }
};

/** GET /api/integrations/meta/connect?channel=facebook|instagram */
exports.metaConnect = [connectLimiter, async (req, res) => {
  const channel = req.query.channel === 'instagram' ? 'instagram' : 'facebook';
  if (!encryptionConfigured()) {
    return res.status(503).json({ error: 'Server encryption key is not configured.', code: 'ENCRYPTION_NOT_CONFIGURED' });
  }
  if (!metaOAuthConfigured()) {
    return res.status(503).json({ error: 'Meta OAuth is not configured on the server.', code: 'META_OAUTH_NOT_CONFIGURED' });
  }

  const state = signOAuthState({ sub: String(req.userId), channel }, 'meta_oauth');
  const url = new URL(`https://www.facebook.com/${env.metaGraphVersion}/dialog/oauth`);
  url.searchParams.set('client_id', env.metaAppId);
  url.searchParams.set('redirect_uri', env.metaOAuthRedirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', META_SCOPES.join(','));
  url.searchParams.set('response_type', 'code');
  return res.json({ url: url.toString() });
}];

/** GET /api/integrations/meta/callback — public OAuth callback. */
exports.metaCallback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError) {
    return res.redirect(integrationRedirect({ meta_error: 'consent_denied' }));
  }
  if (!code || !state) {
    return res.redirect(integrationRedirect({ meta_error: 'missing_code_or_state' }));
  }

  let stateData;
  try {
    stateData = verifyOAuthState(String(state), 'meta_oauth');
  } catch {
    return res.redirect(integrationRedirect({ meta_error: 'invalid_or_expired_state' }));
  }

  try {
    if (!encryptionConfigured() || !metaOAuthConfigured()) {
      return res.redirect(integrationRedirect({ meta_error: 'server_not_configured' }));
    }

    const tokenData = await exchangeCode({
      code: String(code),
      appId: env.metaAppId,
      appSecret: env.metaAppSecret,
      redirectUri: env.metaOAuthRedirectUri,
    });
    const userAccessToken = tokenData.access_token;
    if (!userAccessToken) {
      return res.redirect(integrationRedirect({ meta_error: 'token_exchange_failed' }));
    }

    const pages = await getPageAccounts(userAccessToken);
    const channel = stateData.channel === 'instagram' ? 'instagram' : 'facebook';
    let connected = 0;
    let skipped = 0;

    for (const page of pages) {
      if (!page?.id || !page?.access_token) { skipped += 1; continue; }

      let externalAccountId = String(page.id);
      let displayName = page.name || 'Facebook Page';
      let metadata = { pageId: String(page.id) };

      if (channel === 'instagram') {
        const ig = page.instagram_business_account;
        if (!ig?.id) { skipped += 1; continue; }
        externalAccountId = String(ig.id);
        displayName = ig.username ? `@${ig.username}` : (page.name || 'Instagram account');
        metadata = { pageId: String(page.id), username: ig.username || null };
      }

      const existing = await IntegrationConnection.findOne({
        provider: channel,
        externalAccountId,
      });

      if (existing && String(existing.userId) !== String(stateData.sub)) {
        // The provider account is already owned by another tenant.
        skipped += 1;
        continue;
      }

      await IntegrationConnection.findOneAndUpdate(
        { provider: channel, externalAccountId },
        {
          $set: {
            userId: stateData.sub,
            displayName,
            status: 'connected',
            credentials: {
              accessToken: encryptSecret(page.access_token),
              refreshToken: null,
              tokenExpiry: null,
            },
            metadata,
            lastError: null,
            connectedAt: new Date(),
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      // Best-effort app subscription; webhook setup in the Meta dashboard is
      // still required for delivery.
      try {
        await subscribePage(String(page.id), page.access_token);
      } catch (err) {
        console.warn(`⚠️ Could not subscribe ${channel} page to the app:`, err.message);
      }

      connected += 1;
    }

    if (connected === 0) {
      return res.redirect(integrationRedirect({ meta_error: 'no_eligible_accounts' }));
    }
    return res.redirect(integrationRedirect({
      meta_connected: channel,
      meta_count: String(connected),
      ...(skipped ? { meta_skipped: String(skipped) } : {}),
    }));
  } catch (err) {
    console.error('❌ Meta OAuth callback failed:', err.message);
    return res.redirect(integrationRedirect({ meta_error: 'oauth_failed' }));
  }
};

/** POST /api/integrations/whatsapp — connect a Cloud API phone number manually. */
exports.connectWhatsApp = [connectLimiter, async (req, res) => {
  try {
    if (!encryptionConfigured()) {
      return res.status(503).json({ error: 'Server encryption key is not configured.', code: 'ENCRYPTION_NOT_CONFIGURED' });
    }

    const phoneNumberId = String(req.body.phoneNumberId || '').trim();
    const accessToken = String(req.body.accessToken || '').trim();
    const wabaId = String(req.body.wabaId || '').trim();

    if (!/^\d{5,30}$/.test(phoneNumberId)) {
      return res.status(400).json({ error: 'Enter a valid WhatsApp Phone Number ID (digits only).' });
    }
    if (accessToken.length < 20) {
      return res.status(400).json({ error: 'Enter a valid WhatsApp access token.' });
    }

    let account;
    try {
      account = await verifyWhatsAppAccount(phoneNumberId, accessToken);
    } catch (err) {
      return res.status(err.status && err.status < 500 ? 400 : 502).json({
        error: 'Meta could not verify this phone number and token. Check the credentials and permissions.',
      });
    }

    const existing = await IntegrationConnection.findOne({
      provider: 'whatsapp',
      externalAccountId: phoneNumberId,
    });
    if (existing && String(existing.userId) !== String(req.userId)) {
      return res.status(409).json({ error: 'This WhatsApp number is already connected to another business.' });
    }

    const connection = await IntegrationConnection.findOneAndUpdate(
      { provider: 'whatsapp', externalAccountId: phoneNumberId },
      {
        $set: {
          userId: req.userId,
          displayName: account.verified_name || account.display_phone_number || 'WhatsApp Business',
          status: 'connected',
          credentials: {
            accessToken: encryptSecret(accessToken),
            refreshToken: null,
            tokenExpiry: null,
          },
          metadata: {
            phoneNumber: account.display_phone_number || null,
            wabaId: wabaId || null,
            accountMode: account.account_mode || null,
            qualityRating: account.quality_rating || null,
          },
          lastError: null,
          connectedAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // Keep the legacy field in sync for older UI/read paths, but webhook
    // routing uses the verified connection above.
    await User.findByIdAndUpdate(req.userId, { whatsappPhoneNumberId: phoneNumberId });

    return res.status(201).json({ connection: connection.toSafeJSON() });
  } catch (err) {
    console.error('❌ WhatsApp connect error:', err.message);
    return res.status(500).json({ error: 'Could not connect WhatsApp' });
  }
}];

/** DELETE /api/integrations/:provider/:id — disconnect one of this tenant's accounts. */
exports.disconnect = async (req, res) => {
  try {
    const provider = String(req.params.provider || '');
    if (!['whatsapp', 'facebook', 'instagram'].includes(provider)) {
      return res.status(400).json({ error: 'Unsupported provider' });
    }

    // findOneAndDelete is tenant-scoped: another business's id simply 404s.
    const deleted = await IntegrationConnection.findOneAndDelete({
      _id: req.params.id,
      userId: req.userId,
      provider,
    });
    if (!deleted) return res.status(404).json({ error: 'Connection not found' });

    if (provider === 'whatsapp') {
      const user = await User.findById(req.userId).select('whatsappPhoneNumberId');
      if (user && user.whatsappPhoneNumberId === deleted.externalAccountId) {
        await User.findByIdAndUpdate(req.userId, { $unset: { whatsappPhoneNumberId: 1 } });
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Disconnect error:', err.message);
    return res.status(500).json({ error: 'Could not disconnect channel' });
  }
};
