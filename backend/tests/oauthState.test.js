const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'unit-test-jwt-secret';
const { signOAuthState, verifyOAuthState } = require('../utils/oauthState');

test('signed OAuth state round-trips with the tenant id', () => {
  const state = signOAuthState({ sub: 'tenant-a', channel: 'facebook' }, 'meta_oauth');
  const decoded = verifyOAuthState(state, 'meta_oauth');
  assert.equal(decoded.sub, 'tenant-a');
  assert.equal(decoded.channel, 'facebook');
});

test('OAuth state cannot be reused for a different purpose', () => {
  const state = signOAuthState({ sub: 'tenant-a' }, 'meta_oauth');
  assert.throws(() => verifyOAuthState(state, 'gmail_oauth'));
});

test('tampered OAuth state is rejected', () => {
  const state = signOAuthState({ sub: 'tenant-a' }, 'gmail_oauth');
  assert.throws(() => verifyOAuthState(`${state}x`, 'gmail_oauth'));
});
