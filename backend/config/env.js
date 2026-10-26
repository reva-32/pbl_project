/**
 * Central environment configuration.
 *
 * The project has accumulated two naming conventions over time:
 *   - GOOGLE_* (used by older code / README)
 *   - GMAIL_*  (used by the current .env)
 *   - META_* / WHATSAPP_* (same split for the Meta Graph API)
 *
 * Reading through this module keeps both conventions working without copying
 * values around.  It never logs or serialises a secret.
 */

function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return '';
}

const env = {
  nodeEnv: readEnv('NODE_ENV') || 'development',
  port: parseInt(readEnv('PORT') || '5001', 10) || 5001,
  frontendUrl: (readEnv('FRONTEND_URL') || 'http://localhost:8080').replace(/\/+$/, ''),

  mongoUri: readEnv('MONGO_URI'),
  jwtSecret: readEnv('JWT_SECRET'),
  jwtExpiresIn: readEnv('JWT_EXPIRES_IN') || '7d',

  groqApiKey: readEnv('GROQ_API_KEY'),

  // Google / Gmail OAuth
  googleClientId: readEnv('GOOGLE_CLIENT_ID', 'GMAIL_CLIENT_ID'),
  googleClientSecret: readEnv('GOOGLE_CLIENT_SECRET', 'GMAIL_CLIENT_SECRET'),
  googleRedirectUri: readEnv('GOOGLE_REDIRECT_URI', 'GMAIL_REDIRECT_URI'),
  googlePubsubTopic: readEnv('GOOGLE_PUBSUB_TOPIC', 'GMAIL_PUBSUB_TOPIC'),
  googlePubsubAudience: readEnv('GOOGLE_PUBSUB_AUDIENCE', 'GMAIL_PUBSUB_AUDIENCE'),
  googlePubsubToken: readEnv('GOOGLE_PUBSUB_TOKEN', 'GMAIL_PUBSUB_TOKEN'),

  // Meta (WhatsApp / Messenger / Instagram)
  metaAppId: readEnv('META_APP_ID', 'FACEBOOK_APP_ID'),
  metaAppSecret: readEnv('META_APP_SECRET', 'FACEBOOK_APP_SECRET', 'WHATSAPP_APP_SECRET'),
  metaVerifyToken: readEnv('META_VERIFY_TOKEN', 'WHATSAPP_VERIFY_TOKEN'),
  metaGraphVersion: readEnv('META_GRAPH_VERSION') || 'v22.0',
  metaOAuthRedirectUri: readEnv('META_OAUTH_REDIRECT_URI'),

  // Legacy single-tenant WhatsApp fallback (kept read-only for compatibility)
  legacyWhatsAppAccessToken: readEnv('META_ACCESS_TOKEN', 'WHATSAPP_ACCESS_TOKEN'),
  legacyWhatsAppPhoneNumberId: readEnv('WHATSAPP_PHONE_NUMBER_ID'),

  // AES-256-GCM key for integration tokens at rest.  Must be 32 bytes,
  // base64 (44 chars) or 64 hex chars.  Never commit a real value.
  integrationEncryptionKey: readEnv('INTEGRATION_ENCRYPTION_KEY'),

  // Optional: comma-separated extra origins for CORS.
  extraOrigins: readEnv('CORS_EXTRA_ORIGINS'),
};

/** True when Gmail OAuth can be started (client id + secret + redirect). */
env.gmailConfigured = Boolean(
  env.googleClientId && env.googleClientSecret && env.googleRedirectUri
);

/** True when Meta webhook verification can be performed. */
env.metaWebhookConfigured = Boolean(env.metaVerifyToken);

module.exports = env;
