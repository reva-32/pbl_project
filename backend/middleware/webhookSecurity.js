const crypto = require('crypto');
const env = require('../config/env');
const { safeEqual } = require('../utils/secretBox');

/**
 * Verify Meta's X-Hub-Signature-256 header against the exact raw request body.
 * Returns a boolean; callers decide the status code.
 */
function verifyMetaSignature(req) {
  if (!env.metaAppSecret) return { ok: false, reason: 'not_configured' };
  const received = req.get('x-hub-signature-256') || '';
  if (!received.startsWith('sha256=')) return { ok: false, reason: 'missing_signature' };

  const raw = req.rawBody;
  if (!raw || raw.length === 0) return { ok: false, reason: 'missing_body' };

  const expected = `sha256=${crypto
    .createHmac('sha256', env.metaAppSecret)
    .update(raw)
    .digest('hex')}`;

  try {
    return { ok: safeEqual(received, expected), reason: 'signature_mismatch' };
  } catch {
    return { ok: false, reason: 'signature_mismatch' };
  }
}

/**
 * Gmail Pub/Sub push verification.  Preferred: an OIDC token whose audience is
 * the configured push endpoint.  Alternative for simple setups: a shared
 * token supplied as ?token=... or X-Webhook-Token.
 */
async function verifyGooglePubSub(req) {
  const authHeader = req.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (env.googlePubsubAudience) {
    if (!bearer) return { ok: false, reason: 'missing_oidc_token' };
    try {
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client();
      await client.verifyIdToken({
        idToken: bearer,
        audience: env.googlePubsubAudience,
      });
      return { ok: true, reason: 'oidc' };
    } catch {
      return { ok: false, reason: 'invalid_oidc_token' };
    }
  }

  if (env.googlePubsubToken) {
    const supplied = req.get('x-webhook-token') || req.query.token || '';
    return safeEqual(supplied, env.googlePubsubToken)
      ? { ok: true, reason: 'shared_token' }
      : { ok: false, reason: 'invalid_shared_token' };
  }

  return { ok: false, reason: 'not_configured' };
}

module.exports = { verifyMetaSignature, verifyGooglePubSub };
