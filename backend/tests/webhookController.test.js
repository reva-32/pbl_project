const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.JWT_SECRET = 'unit-test-jwt-secret';
process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.META_VERIFY_TOKEN = 'test-verify-token';

const IntegrationConnection = require('../models/integrationConnection');
const inbox = require('../services/inboxService');

const saved = [];
inbox.saveInboundMessage = async (input) => {
  saved.push(input);
  return { event: { _id: `saved-${saved.length}` }, duplicate: false };
};
inbox.updateDeliveryStatus = async (input) => {
  saved.push({ statusUpdate: input });
  return null;
};

const controller = require('../controllers/webhookController');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    sendStatus(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function signedRequest(body) {
  const raw = JSON.stringify(body);
  const signature = `sha256=${crypto.createHmac('sha256', process.env.META_APP_SECRET).update(raw).digest('hex')}`;
  return {
    body,
    rawBody: Buffer.from(raw),
    query: {},
    get(name) {
      return name.toLowerCase() === 'x-hub-signature-256' ? signature : undefined;
    },
  };
}

function whatsAppBody(messageId = 'wamid.1') {
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-1',
      changes: [{
        value: {
          metadata: { phone_number_id: 'phone-1' },
          contacts: [{ profile: { name: 'Asha' } }],
          messages: [{
            from: '919999999999',
            id: messageId,
            timestamp: '1700000000',
            type: 'text',
            text: { body: 'Where is my order?' },
          }],
        },
      }],
    }],
  };
}

test('rejects a webhook with an invalid signature before processing', async () => {
  saved.length = 0;
  const req = signedRequest(whatsAppBody());
  req.get = () => 'sha256=deadbeef';
  const res = createRes();
  await controller.receiveNotification(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(saved.length, 0);
});

test('routes a verified WhatsApp message to the owning tenant only', async () => {
  saved.length = 0;
  IntegrationConnection.findOne = async (query) => {
    assert.equal(query.provider, 'whatsapp');
    assert.equal(query.externalAccountId, 'phone-1');
    assert.equal(query.status, 'connected');
    return { userId: 'tenant-a', externalAccountId: 'phone-1' };
  };

  const res = createRes();
  await controller.receiveNotification(signedRequest(whatsAppBody('wamid.1')), res);

  assert.equal(res.statusCode, 200);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].userId, 'tenant-a');
  assert.equal(saved[0].provider, 'whatsapp');
  assert.equal(saved[0].accountId, 'phone-1');
  assert.equal(saved[0].senderPhone, '919999999999');
  assert.equal(saved[0].text, 'Where is my order?');
});

test('does not save a message when the account is not connected', async () => {
  saved.length = 0;
  IntegrationConnection.findOne = async () => null;
  const res = createRes();
  await controller.receiveNotification(signedRequest(whatsAppBody('wamid.2')), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved.length, 0);
});

test('routes a Messenger event to the page owner', async () => {
  saved.length = 0;
  IntegrationConnection.findOne = async (query) => {
    assert.equal(query.provider, 'facebook');
    assert.equal(query.externalAccountId, 'page-1');
    return { userId: 'tenant-b', externalAccountId: 'page-1' };
  };

  const body = {
    object: 'page',
    entry: [{
      id: 'page-1',
      messaging: [{
        sender: { id: 'psid-1' },
        recipient: { id: 'page-1' },
        timestamp: 1700000000000,
        message: { mid: 'mid.1', text: 'Hello from Messenger' },
      }],
    }],
  };

  const res = createRes();
  await controller.receiveNotification(signedRequest(body), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved[0].userId, 'tenant-b');
  assert.equal(saved[0].provider, 'facebook');
  assert.equal(saved[0].senderId, 'psid-1');
  assert.equal(saved[0].text, 'Hello from Messenger');
});

test('routes an Instagram event to the Instagram account owner', async () => {
  saved.length = 0;
  IntegrationConnection.findOne = async (query) => {
    assert.equal(query.provider, 'instagram');
    assert.equal(query.externalAccountId, 'ig-1');
    return { userId: 'tenant-c', externalAccountId: 'ig-1' };
  };

  const body = {
    object: 'instagram',
    entry: [{
      id: 'ig-1',
      messaging: [{
        sender: { id: 'igsid-1' },
        recipient: { id: 'ig-1' },
        timestamp: 1700000000000,
        message: { mid: 'ig.mid.1', text: 'Hi from Instagram' },
      }],
    }],
  };

  const res = createRes();
  await controller.receiveNotification(signedRequest(body), res);
  assert.equal(res.statusCode, 200);
  assert.equal(saved[0].userId, 'tenant-c');
  assert.equal(saved[0].provider, 'instagram');
  assert.equal(saved[0].text, 'Hi from Instagram');
});

test('whatsapp verification rejects the wrong verify token', () => {
  const req = { query: { 'hub.mode': 'subscribe', 'hub.verify_token': 'wrong', 'hub.challenge': '123' } };
  const res = createRes();
  controller.verifyWebhook(req, res);
  assert.equal(res.statusCode, 403);
});
