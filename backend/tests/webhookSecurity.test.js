const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.GOOGLE_PUBSUB_TOKEN = 'test-pubsub-token';
const { verifyMetaSignature, verifyGooglePubSub } = require('../middleware/webhookSecurity');

function metaRequest(raw, signature) {
  return {
    rawBody: Buffer.from(raw),
    get(name) {
      return name.toLowerCase() === 'x-hub-signature-256' ? signature : undefined;
    },
  };
}

test('accepts a correct Meta signature', () => {
  const raw = JSON.stringify({ object: 'page', entry: [] });
  const signature = `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(raw).digest('hex')}`;
  assert.equal(verifyMetaSignature(metaRequest(raw, signature)).ok, true);
});

test('rejects a forged Meta signature', () => {
  const raw = JSON.stringify({ object: 'page', entry: [{ id: 'attacker' }] });
  const signature = `sha256=${crypto.createHmac('sha256', 'wrong-secret').update(raw).digest('hex')}`;
  const result = verifyMetaSignature(metaRequest(raw, signature));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'signature_mismatch');
});

test('rejects a missing Meta signature', () => {
  assert.equal(verifyMetaSignature(metaRequest('{}', '')).ok, false);
});

test('accepts a valid Gmail shared token', async () => {
  const req = {
    get: () => undefined,
    query: { token: 'test-pubsub-token' },
  };
  assert.equal((await verifyGooglePubSub(req)).ok, true);
});

test('rejects an invalid Gmail shared token', async () => {
  const req = {
    get: () => undefined,
    query: { token: 'wrong' },
  };
  assert.equal((await verifyGooglePubSub(req)).ok, false);
});
