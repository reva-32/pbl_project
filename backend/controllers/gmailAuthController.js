const { google } = require('googleapis');
const User = require('../models/user');
const DecisionEvent = require('../models/DecisionEvent');
const env = require('../config/env');
const { isConfigured: encryptionConfigured, encryptSecret } = require('../utils/secretBox');
const { signOAuthState, verifyOAuthState } = require('../utils/oauthState');
const {
  GMAIL_SCOPES,
  createOAuthClient,
  getAuthedGmail,
  parseGmailMessage,
  extractEmail,
  extractName,
  persistRefreshedTokens,
} = require('../services/providers/gmailClient');
const { saveInboundMessage } = require('../services/inboxService');

function integrationRedirect(params = {}) {
  const url = new URL('/integrations', env.frontendUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

/**
 * GET /api/webhook/gmail/auth/url
 * Returns a Google consent URL carrying a short-lived signed state token.
 */
exports.getAuthUrl = (req, res) => {
  if (!encryptionConfigured()) {
    return res.status(503).json({
      error: 'Server encryption key is not configured. Add INTEGRATION_ENCRYPTION_KEY before connecting channels.',
      code: 'ENCRYPTION_NOT_CONFIGURED',
    });
  }
  if (!env.gmailConfigured) {
    return res.status(503).json({
      error: 'Gmail OAuth is not configured on the server.',
      code: 'GMAIL_NOT_CONFIGURED',
    });
  }

  let oauth2Client;
  try {
    oauth2Client = createOAuthClient();
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }

  const state = signOAuthState({ sub: String(req.userId) }, 'gmail_oauth');
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: GMAIL_SCOPES,
    state,
  });
  return res.json({ url });
};

/**
 * GET /api/webhook/gmail/auth/callback
 * Public OAuth callback. The signed state is the only trusted tenant identity.
 */
exports.authCallback = async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  if (oauthError) {
    return res.redirect(integrationRedirect({ gmail_error: 'consent_denied' }));
  }
  if (!code || !state) {
    return res.redirect(integrationRedirect({ gmail_error: 'missing_code_or_state' }));
  }

  let stateData;
  try {
    stateData = verifyOAuthState(String(state), 'gmail_oauth');
  } catch {
    return res.redirect(integrationRedirect({ gmail_error: 'invalid_or_expired_state' }));
  }

  try {
    if (!encryptionConfigured()) {
      return res.redirect(integrationRedirect({ gmail_error: 'encryption_not_configured' }));
    }

    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(String(code));
    oauth2Client.setCredentials(tokens);

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profileRes = await gmail.users.getProfile({ userId: 'me' });
    const googleEmail = String(profileRes.data.emailAddress || '').toLowerCase();
    if (!googleEmail) {
      return res.redirect(integrationRedirect({ gmail_error: 'profile_unavailable' }));
    }

    const user = await User.findById(stateData.sub);
    if (!user) {
      return res.redirect(integrationRedirect({ gmail_error: 'user_not_found' }));
    }

    // One Gmail mailbox may only feed one tenant. Without this check, the
    // Pub/Sub notification (which identifies the mailbox, not the tenant) would
    // be ambiguous and could place messages in the wrong workspace.
    const alreadyConnected = await User.findOne({
      _id: { $ne: user._id },
      googleEmail,
      googleRefreshToken: { $ne: null },
    }).select('_id');
    if (alreadyConnected) {
      return res.redirect(integrationRedirect({ gmail_error: 'account_already_connected' }));
    }

    const update = {
      googleEmail,
      googleAccessToken: tokens.access_token ? encryptSecret(tokens.access_token) : user.googleAccessToken,
      googleTokenExpiry: tokens.expiry_date || user.googleTokenExpiry || null,
    };
    if (tokens.refresh_token) {
      update.googleRefreshToken = encryptSecret(tokens.refresh_token);
    }
    if (!user.googleRefreshToken && !tokens.refresh_token) {
      return res.redirect(integrationRedirect({ gmail_error: 'refresh_token_missing' }));
    }

    await User.findByIdAndUpdate(user._id, update);

    // Register Gmail push notifications when a Pub/Sub topic is configured.
    if (env.googlePubsubTopic) {
      try {
        const watchRes = await gmail.users.watch({
          userId: 'me',
          requestBody: { topicName: env.googlePubsubTopic, labelIds: ['INBOX'] },
        });
        if (watchRes.data.historyId) {
          await User.findByIdAndUpdate(user._id, {
            lastGmailHistoryId: String(watchRes.data.historyId),
          });
        }
      } catch (watchErr) {
        // Connection still works through manual sync; push needs dashboard setup.
        console.warn('⚠️ Gmail watch could not be registered:', watchErr.message);
      }
    }

    await persistRefreshedTokens(User, user._id, oauth2Client.credentials);
    return res.redirect(integrationRedirect({ gmail_connected: 'true' }));
  } catch (err) {
    console.error('❌ Gmail OAuth callback failed:', err.message);
    return res.redirect(integrationRedirect({ gmail_error: 'oauth_failed' }));
  }
};

/**
 * GET /api/webhook/gmail/auth/status
 * Booleans only — tokens never leave the server.
 */
exports.gmailStatus = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      'googleEmail googleAccessToken googleRefreshToken googleTokenExpiry lastGmailHistoryId'
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      connected: !!(user.googleRefreshToken && user.googleEmail),
      googleEmail: user.googleEmail || null,
      hasAccessToken: !!user.googleAccessToken,
      hasRefreshToken: !!user.googleRefreshToken,
      tokenExpiry: user.googleTokenExpiry ? new Date(user.googleTokenExpiry).toISOString() : null,
      lastGmailHistoryId: user.lastGmailHistoryId || null,
      pushConfigured: Boolean(env.googlePubsubTopic),
      encryptionConfigured: encryptionConfigured(),
      savedMessages: await DecisionEvent.countDocuments({
        userId: req.userId,
        type: 'CUSTOMER_MSG',
        'content.platform': 'Email',
      }),
    });
  } catch (err) {
    console.error('❌ Gmail status error:', err.message);
    res.status(500).json({ error: 'Could not load Gmail status' });
  }
};

/**
 * POST /api/webhook/gmail/auth/sync
 * Manually pull recent inbox messages. Does not send anything.
 */
exports.manualSync = async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || !user.googleRefreshToken) {
      return res.status(400).json({ error: 'Gmail not connected. Please connect Gmail first.' });
    }

    let gmail;
    let auth;
    try {
      ({ gmail, auth } = getAuthedGmail(user));
    } catch (err) {
      if (err.message?.includes('INTEGRATION_ENCRYPTION_KEY')) {
        return res.status(503).json({ error: 'Server encryption key is not configured.' });
      }
      throw err;
    }

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults: limit,
      labelIds: ['INBOX'],
      q: user.googleEmail ? `-from:${user.googleEmail}` : undefined,
    });

    const messageList = listRes.data.messages || [];
    if (messageList.length === 0) {
      return res.json({ synced: 0, skipped: 0, errors: [], total: 0 });
    }

    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const { id: messageId } of messageList) {
      let msgRes;
      try {
        msgRes = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
      } catch (err) {
        errors.push('Could not fetch one message');
        continue;
      }

      const parsed = parseGmailMessage(msgRes.data, user.googleEmail);
      if (parsed.labelIds.includes('SENT')) { skipped += 1; continue; }
      const senderEmail = extractEmail(parsed.from);
      if (senderEmail && senderEmail === String(user.googleEmail || '').toLowerCase()) {
        skipped += 1;
        continue;
      }

      const result = await saveInboundMessage({
        userId: user._id,
        provider: 'gmail',
        accountId: String(user.googleEmail || '').toLowerCase(),
        externalMessageId: parsed.id,
        senderId: senderEmail,
        senderName: extractName(parsed.from),
        senderEmail,
        text: parsed.body || parsed.snippet,
        subject: parsed.subject,
        timestamp: parsed.date ? new Date(parsed.date) : new Date(),
        threadId: parsed.threadId,
        rfcMessageId: parsed.rfcMessageId,
        references: parsed.references,
        metadata: { labelIds: parsed.labelIds },
      });

      if (result.duplicate) skipped += 1;
      else synced += 1;
    }

    await persistRefreshedTokens(User, user._id, auth.credentials);
    return res.json({ synced, skipped, errors, total: messageList.length });
  } catch (err) {
    console.error('❌ Manual Gmail sync error:', err.message);
    return res.status(500).json({ error: 'Gmail sync failed. Please reconnect if the problem persists.' });
  }
};

/** DELETE /api/webhook/gmail/auth — disconnect Gmail for this tenant only. */
exports.disconnectGmail = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('googleAccessToken googleRefreshToken');
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Best-effort revocation; failure must not block local disconnection.
    try {
      const oauth2Client = createOAuthClient();
      const token = user.googleRefreshToken;
      if (token) {
        const { decryptSecret } = require('../utils/secretBox');
        await oauth2Client.revokeToken(decryptSecret(token));
      }
    } catch { /* ignore revocation errors */ }

    await User.findByIdAndUpdate(req.userId, {
      $unset: {
        googleAccessToken: 1,
        googleRefreshToken: 1,
        googleTokenExpiry: 1,
        googleEmail: 1,
        lastGmailHistoryId: 1,
      },
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('❌ Gmail disconnect error:', err.message);
    return res.status(500).json({ error: 'Could not disconnect Gmail' });
  }
};
