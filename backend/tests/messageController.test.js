const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'unit-test-jwt-secret';
process.env.INTEGRATION_ENCRYPTION_KEY = 'b'.repeat(64);

const DecisionEvent = require('../models/DecisionEvent');
const User = require('../models/user');
const IntegrationConnection = require('../models/integrationConnection');
const graph = require('../services/providers/graphClient');
const gmail = require('../services/providers/gmailClient');
const inbox = require('../services/inboxService');
const { encryptSecret } = require('../utils/secretBox');

const providerCalls = [];
const outboundCalls = [];

graph.sendWhatsAppText = async (args) => {
  providerCalls.push({ provider: 'whatsapp', args });
  return { messages: [{ id: 'wamid.outbound' }] };
};
graph.sendMessengerText = async (args) => {
  providerCalls.push({ provider: 'facebook', args });
  return { message_id: 'mid.outbound' };
};
graph.sendInstagramText = async (args) => {
  providerCalls.push({ provider: 'instagram', args });
  return { message_id: 'ig.outbound' };
};
gmail.sendGmailReply = async (args) => {
  providerCalls.push({ provider: 'gmail', args });
  return { providerMessageId: 'gmail-outbound-id', threadId: 'thread-1' };
};
inbox.recordOutboundMessage = async (args) => {
  outboundCalls.push(args);
  return { _id: 'outbound-event' };
};

// Loaded after the provider/service functions are replaced.
const controller = require('../controllers/messageController');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function createEvent(overrides = {}) {
  const event = {
    _id: 'event-1',
    userId: 'tenant-a',
    status: 'PENDING',
    content: {
      provider: 'whatsapp',
      platform: 'WhatsApp',
      accountId: 'phone-1',
      senderId: '919999999999',
      senderPhone: '919999999999',
      conversationId: 'whatsapp:phone-1:919999999999',
      customerId: 'cust-1',
      direction: 'inbound',
      subject: '',
      ...overrides.content,
    },
    markModified() {},
    async save() { this.saved = true; },
    ...overrides,
  };
  return event;
}

function resetCalls() {
  providerCalls.length = 0;
  outboundCalls.length = 0;
}

test('denies access to another tenant\'s event without sending anything', async () => {
  resetCalls();
  let receivedQuery = null;
  DecisionEvent.findOne = async (query) => { receivedQuery = query; return null; };

  const req = { userId: 'tenant-a', body: { eventId: 'other-tenant-event', message: 'Hello' } };
  const res = createRes();
  await controller.sendReply(req, res);

  assert.equal(res.statusCode, 404);
  assert.equal(receivedQuery.userId, 'tenant-a');
  assert.equal(providerCalls.length, 0);
  assert.equal(outboundCalls.length, 0);
});

test('routes a WhatsApp reply through the tenant connection and records sent status', async () => {
  resetCalls();
  const event = createEvent();
  DecisionEvent.findOne = async () => event;
  IntegrationConnection.findOne = async (query) => {
    assert.equal(query.userId, 'tenant-a');
    assert.equal(query.externalAccountId, 'phone-1');
    return {
      _id: 'conn-1',
      externalAccountId: 'phone-1',
      credentials: { accessToken: encryptSecret('meta-token') },
      metadata: {},
    };
  };

  const req = { userId: 'tenant-a', body: { eventId: 'event-1', message: 'Your order ships today.' } };
  const res = createRes();
  await controller.sendReply(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0].provider, 'whatsapp');
  assert.equal(providerCalls[0].args.to, '919999999999');
  assert.equal(providerCalls[0].args.text, 'Your order ships today.');
  assert.equal(outboundCalls[0].deliveryStatus, 'sent');
  assert.equal(outboundCalls[0].providerMessageId, 'wamid.outbound');
  assert.equal(event.status, 'RESOLVED');
  assert.equal(event.content.replies.length, 1);
});

test('records a provider failure as failed and returns a safe error', async () => {
  resetCalls();
  const event = createEvent();
  DecisionEvent.findOne = async () => event;
  IntegrationConnection.findOne = async () => ({
    _id: 'conn-1',
    externalAccountId: 'phone-1',
    credentials: { accessToken: encryptSecret('expired-token') },
    metadata: {},
  });
  graph.sendWhatsAppText = async () => {
    throw new graph.ProviderError('Access token expired', { status: 401, code: 190 });
  };

  const req = { userId: 'tenant-a', body: { eventId: 'event-1', message: 'Hello' } };
  const res = createRes();
  await controller.sendReply(req, res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /reconnect/i);
  assert.equal(outboundCalls[0].deliveryStatus, 'failed');
  assert.notEqual(event.status, 'RESOLVED');
});

test('routes a Gmail reply with the original thread metadata', async () => {
  resetCalls();
  const event = createEvent({
    content: {
      provider: 'gmail',
      platform: 'Email',
      accountId: 'owner@example.com',
      sender: 'Asha <asha@example.com>',
      senderEmail: 'asha@example.com',
      subject: 'Invoice question',
      direction: 'inbound',
      conversationId: 'gmail:owner@example.com:asha@example.com',
      threadId: 'thread-1',
      customerId: 'cust-1',
    },
  });
  DecisionEvent.findOne = async () => event;
  User.findById = async () => ({ _id: 'tenant-a', googleEmail: 'owner@example.com', googleRefreshToken: 'encrypted' });

  const req = { userId: 'tenant-a', body: { eventId: 'event-1', message: 'Thanks for reaching out.' } };
  const res = createRes();
  await controller.sendReply(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(providerCalls[0].provider, 'gmail');
  assert.equal(outboundCalls[0].provider, 'gmail');
  assert.equal(outboundCalls[0].deliveryStatus, 'sent');
});

test('routes Facebook Messenger replies through the page connection', async () => {
  resetCalls();
  const event = createEvent({
    content: {
      provider: 'facebook',
      platform: 'Facebook',
      accountId: 'page-1',
      senderId: 'psid-1',
      direction: 'inbound',
      conversationId: 'facebook:page-1:psid-1',
      customerId: 'cust-2',
    },
  });
  DecisionEvent.findOne = async () => event;
  IntegrationConnection.findOne = async (query) => {
    assert.equal(query.userId, 'tenant-a');
    assert.equal(query.provider, 'facebook');
    return {
      _id: 'conn-fb',
      externalAccountId: 'page-1',
      credentials: { accessToken: encryptSecret('page-token') },
      metadata: { pageId: 'page-1' },
    };
  };

  const req = { userId: 'tenant-a', body: { eventId: 'event-1', message: 'Hello from Messenger' } };
  const res = createRes();
  await controller.sendReply(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(providerCalls[0].provider, 'facebook');
  assert.equal(providerCalls[0].args.pageId, 'page-1');
  assert.equal(providerCalls[0].args.recipientId, 'psid-1');
});

test('rejects replies longer than the provider-safe limit', async () => {
  resetCalls();
  const req = { userId: 'tenant-a', body: { eventId: 'event-1', message: 'x'.repeat(4001) } };
  const res = createRes();
  await controller.sendReply(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(providerCalls.length, 0);
});
