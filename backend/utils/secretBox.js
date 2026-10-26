const crypto = require('crypto');
const env = require('../config/env');

/**
 * AES-256-GCM envelope for provider credentials at rest.
 *
 * Key management:
 *   - INTEGRATION_ENCRYPTION_KEY must contain 32 random bytes, encoded either
 *     as 64 hex characters or base64 (44 chars).
 *   - The key belongs in the deployment secret manager, never in Git.
 *   - Rotating the key requires re-encrypting existing rows (or reconnecting
 *     the channels).  Keep the old key available during rotation if you write
 *     a migration.
 *
 * Stored format:  v1:<iv-base64>:<authTag-base64>:<ciphertext-base64>
 * Legacy plaintext values (created before encryption existed) are still
 * readable so existing Gmail connections keep working.  They are re-encrypted
 * the next time the channel is saved.
 */

const PREFIX = 'v1';

function readKey() {
  const raw = env.integrationEncryptionKey;
  if (!raw) return null;

  let key;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, 'hex');
  } else {
    try {
      key = Buffer.from(raw, 'base64');
    } catch {
      return null;
    }
  }
  return key.length === 32 ? key : null;
}

function isConfigured() {
  return Boolean(readKey());
}

function requireKey() {
  const key = readKey();
  if (!key) {
    throw new Error(
      'INTEGRATION_ENCRYPTION_KEY is missing or invalid. ' +
      'Generate 32 random bytes (see .env.example) before connecting channels.'
    );
  }
  return key;
}

function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

function encryptSecret(plainText) {
  if (plainText === null || plainText === undefined || plainText === '') return null;
  const key = requireKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(plainText), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

function decryptSecret(value) {
  if (value === null || value === undefined || value === '') return null;
  // Legacy plaintext token — readable for backward compatibility.
  if (!isEncrypted(value)) return String(value);

  const key = requireKey();
  const parts = String(value).split(':');
  if (parts.length !== 4) throw new Error('Malformed encrypted credential');

  const [, ivB64, tagB64, ciphertextB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/** Constant-time string comparison for webhook tokens. */
function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  isConfigured,
  isEncrypted,
  encryptSecret,
  decryptSecret,
  safeEqual,
};
