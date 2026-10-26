const test = require('node:test');
const assert = require('node:assert/strict');

process.env.INTEGRATION_ENCRYPTION_KEY = 'a'.repeat(64);
const { encryptSecret, decryptSecret, isEncrypted, isConfigured } = require('../utils/secretBox');

test('encrypts and decrypts a token without storing plaintext', () => {
  const token = 'EAAB-secret-token-value';
  const stored = encryptSecret(token);
  assert.equal(isConfigured(), true);
  assert.equal(isEncrypted(stored), true);
  assert.notEqual(stored, token);
  assert.equal(stored.includes(token), false);
  assert.equal(decryptSecret(stored), token);
});

test('reads legacy plaintext tokens for backward compatibility', () => {
  assert.equal(decryptSecret('legacy-token'), 'legacy-token');
});

test('rejects tampered ciphertext', () => {
  const stored = encryptSecret('sensitive');
  const parts = stored.split(':');
  const tampered = [parts[0], parts[1], parts[2], Buffer.from('changed').toString('base64')].join(':');
  assert.throws(() => decryptSecret(tampered));
});

test('returns null for empty values', () => {
  assert.equal(encryptSecret(''), null);
  assert.equal(decryptSecret(null), null);
});
