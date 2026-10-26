const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'unit-test-jwt-secret';
process.env.INTEGRATION_ENCRYPTION_KEY = 'c'.repeat(64);
process.env.GOOGLE_CLIENT_ID = 'google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'https://api.example.com/api/webhook/gmail/auth/callback';
process.env.META_APP_ID = 'meta-app-id';
process.env.META_APP_SECRET = 'meta-app-secret';
process.env.META_OAUTH_REDIRECT_URI = 'https://api.example.com/api/integrations/meta/callback';
process.env.META_GRAPH_VERSION = 'v22.0';

const graph = require('../services/providers/graphClient');
const gmail = require('../services/providers/gmailClient');
const integrationController = require('../controllers/integrationController');
const gmailController = require('../controllers/gmailAuthController');

function fakeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(body); },
  };
}

test('Meta client sends tokens in the Authorization header, not the URL', async () => {
  let captured;
  const fetchImpl = async (url, options) => {
    captured = { url: String(url), options };
    return fakeResponse(200, { messages: [{ id: 'wamid.1' }] });
  };

  await graph.sendWhatsAppText({
    phoneNumberId: '12345',
    accessToken: 'secret-access-token',
    to: '919999999999',
    text: 'Hello',
    fetchImpl,
  });

  assert.equal(captured.url.includes('secret-access-token'), false);
  assert.equal(captured.options.headers.Authorization, 'Bearer secret-access-token');
  const body = JSON.parse(captured.options.body);
  assert.equal(body.messaging_product, 'whatsapp');
  assert.equal(body.to, '919999999999');
});

test('Meta client maps provider failures without exposing the request', async () => {
  const fetchImpl = async () => fakeResponse(400, {
    error: { message: 'Invalid recipient', code: 100, error_subcode: 2018001 },
  });

  await assert.rejects(
    () => graph.sendMessengerText({
      pageId: 'page-1',
      accessToken: 'token',
      recipientId: 'psid',
      text: 'Hello',
      fetchImpl,
    }),
    (err) => {
      assert.equal(err.name, 'ProviderError');
      assert.equal(err.status, 400);
      assert.equal(err.code, 100);
      assert.equal(err.message, 'Invalid recipient');
      return true;
    }
  );
});

test('Gmail reply builder creates a valid RFC 822 message', () => {
  const raw = gmail.buildRawReply({
    from: 'owner@example.com',
    to: 'asha@example.com',
    subject: 'Invoice question',
    body: 'Thanks for reaching out.',
    inReplyTo: '<message-1@example.com>',
    references: '<message-1@example.com>',
  });
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(decoded, /^From: owner@example\.com/m);
  assert.match(decoded, /^To: asha@example\.com/m);
  assert.match(decoded, /^Subject: Re: Invoice question/m);
  assert.match(decoded, /^In-Reply-To: <message-1@example\.com>/m);
  assert.match(decoded, /Thanks for reaching out\./);
});

test('Gmail address parsing handles display names', () => {
  assert.equal(gmail.extractEmail('Asha Rao <asha@example.com>'), 'asha@example.com');
  assert.equal(gmail.extractName('Asha Rao <asha@example.com>'), 'Asha Rao');
});

test('Gmail connect URL carries a signed state and send scope', async () => {
  let payload;
  const res = {
    json(body) { payload = body; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  await gmailController.getAuthUrl({ userId: 'tenant-a' }, res);
  assert.ok(payload?.url);
  const url = new URL(payload.url);
  assert.equal(url.hostname, 'accounts.google.com');
  assert.ok(url.searchParams.get('scope').includes('gmail.send'));
  assert.ok(url.searchParams.get('state'));
  assert.equal(url.searchParams.get('access_type'), 'offline');
});

test('Meta connect URL includes tenant state and messaging scopes', () => {
  let payload;
  const res = {
    json(body) { payload = body; return this; },
    status(code) { this.statusCode = code; return this; },
  };
  const handler = integrationController.metaConnect[1];
  handler({ userId: 'tenant-a', query: { channel: 'instagram' } }, res);
  assert.ok(payload?.url);
  const url = new URL(payload.url);
  assert.equal(url.searchParams.get('client_id'), 'meta-app-id');
  assert.ok(url.searchParams.get('scope').includes('instagram_manage_messages'));
  assert.ok(url.searchParams.get('state'));
});
