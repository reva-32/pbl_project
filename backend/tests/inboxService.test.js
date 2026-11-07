const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'unit-test-jwt-secret';
const {
  saveInboundMessage,
  recordOutboundMessage,
  listConversations,
} = require('../services/inboxService');

function createFakeModels() {
  const events = [];
  const customers = [];
  const updates = [];

  const DecisionEventModel = {
    async findOne(query) {
      return events.find((event) =>
        String(event.userId) === String(query.userId)
        && event.type === query.type
        && event.content?.provider === query['content.provider']
        && event.content?.providerMessageId === query['content.providerMessageId']
      ) || null;
    },
    async create(doc) {
      const event = { _id: `evt-${events.length + 1}`, ...doc };
      events.push(event);
      return event;
    },
    find(query) {
      return {
        sort() {
          return {
            limit() {
              return {
                async lean() {
                  return events.filter((e) => String(e.userId) === String(query.userId));
                },
              };
            },
          };
        },
      };
    },
    findOneAndUpdate() { return null; },
  };

  const CustomerModel = {
    async findOne(query) {
      return customers.find((c) =>
        String(c.userId) === String(query.userId)
        && ((query.$or || []).some((part) =>
          (part.email && part.email === c.email) || (part.phone && part.phone === c.phone)
        ))
      ) || null;
    },
    async create(doc) {
      const customer = { _id: `cust-${customers.length + 1}`, ...doc };
      customers.push(customer);
      return customer;
    },
    async findByIdAndUpdate(id, update) {
      const customer = customers.find((c) => c._id === id);
      Object.assign(customer, update);
      return customer;
    },
    find(query) {
      return {
        async lean() {
          return customers.filter((c) => String(c.userId) === String(query.userId));
        },
      };
    },
  };

  const ConnectionModel = {
    updateOne(query, update) {
      updates.push({ query, update });
      return Promise.resolve({ modifiedCount: 1 });
    },
  };

  return { events, customers, updates, DecisionEventModel, CustomerModel, ConnectionModel };
}

const classifier = async () => ({ summary: 'Customer asks about an order', category: 'GENERAL', priority: 'LOW' });
const embedder = async () => [0.1, 0.2, 0.3];

test('stores one inbound message per tenant with channel metadata', async () => {
  const models = createFakeModels();
  const result = await saveInboundMessage({
    userId: 'tenant-a',
    provider: 'whatsapp',
    accountId: 'phone-1',
    externalMessageId: 'wamid-1',
    senderId: '919999999999',
    senderName: 'Asha',
    senderPhone: '919999999999',
    text: 'Where is my order?',
  }, { ...models, classifier, embedder });

  assert.equal(result.duplicate, false);
  assert.equal(models.events.length, 1);
  assert.equal(result.event.userId, 'tenant-a');
  assert.equal(result.event.content.provider, 'whatsapp');
  assert.equal(result.event.content.platform, 'WhatsApp');
  assert.equal(result.event.content.deliveryStatus, 'received');
  assert.equal(result.event.content.direction, 'inbound');
  assert.ok(result.event.content.conversationId.startsWith('whatsapp:phone-1:'));
  assert.equal(result.event.content.customerId, 'cust-1');
});

test('retains privacy-filtered inbound message context without blocking inbox persistence', async () => {
  const models = createFakeModels();
  const retained = [];
  await saveInboundMessage({
    userId: 'tenant-a',
    provider: 'gmail',
    accountId: 'business@example.com',
    externalMessageId: 'mail-1',
    senderName: 'Customer Name',
    senderEmail: 'customer@example.com',
    senderPhone: '+91 98765 43210',
    text: 'Please call me at +91 98765 43210 or email customer@example.com about my delayed order.',
    timestamp: '2026-11-07T10:00:00.000Z',
  }, {
    ...models,
    classifier,
    embedder,
    hindsightRetainer: async (...args) => { retained.push(args); },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(models.events.length, 1);
  assert.equal(retained.length, 1);
  assert.equal(retained[0][0], 'tenant-a');
  assert.match(retained[0][1], /delayed order/);
  assert.doesNotMatch(retained[0][1], /customer@example.com|98765/);
  assert.equal(retained[0][2].source, 'customer_message_inbound');
  assert.equal(retained[0][2].documentId, 'evt-1');
  assert.equal(retained[0][2].timestamp, '2026-11-07T10:00:00.000Z');
});

test('retains successful outbound replies but not failed delivery attempts', async () => {
  const models = createFakeModels();
  const retained = [];
  const deps = {
    DecisionEventModel: models.DecisionEventModel,
    embedder,
    hindsightRetainer: async (...args) => { retained.push(args); },
  };

  await recordOutboundMessage({
    userId: 'tenant-a', provider: 'whatsapp', recipient: '+91 98765 43210',
    text: 'Your order will arrive tomorrow.', deliveryStatus: 'sent',
  }, deps);
  await recordOutboundMessage({
    userId: 'tenant-a', provider: 'whatsapp', recipient: '+91 98765 43210',
    text: 'This message failed.', deliveryStatus: 'failed',
  }, deps);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(models.events.length, 2);
  assert.equal(retained.length, 1);
  assert.equal(retained[0][2].source, 'customer_message_outbound');
  assert.doesNotMatch(retained[0][1], /98765/);
});

test('Hindsight retention failure does not roll back an inbound message', async () => {
  const models = createFakeModels();
  const result = await saveInboundMessage({
    userId: 'tenant-a',
    provider: 'instagram',
    accountId: 'ig-account',
    externalMessageId: 'ig-1',
    senderId: 'customer-id',
    text: 'Can you share the order status?',
  }, {
    ...models,
    classifier,
    embedder,
    hindsightRetainer: async () => { throw new Error('Hindsight unavailable'); },
  });

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(result.duplicate, false);
  assert.equal(models.events.length, 1);
});

test('duplicate webhook delivery is idempotent per tenant', async () => {
  const models = createFakeModels();
  const input = {
    userId: 'tenant-a',
    provider: 'facebook',
    accountId: 'page-1',
    externalMessageId: 'mid-1',
    senderId: 'psid-1',
    text: 'Hello',
  };
  const first = await saveInboundMessage(input, { ...models, classifier, embedder });
  const second = await saveInboundMessage(input, { ...models, classifier, embedder });

  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  assert.equal(models.events.length, 1);
});

test('the same provider message can exist in a different tenant only with its own userId', async () => {
  const models = createFakeModels();
  await saveInboundMessage({
    userId: 'tenant-a',
    provider: 'whatsapp',
    accountId: 'phone-1',
    externalMessageId: 'same-id',
    senderId: '111',
    text: 'Tenant A message',
  }, { ...models, classifier, embedder });

  const other = await saveInboundMessage({
    userId: 'tenant-b',
    provider: 'whatsapp',
    accountId: 'phone-2',
    externalMessageId: 'same-id',
    senderId: '222',
    text: 'Tenant B message',
  }, { ...models, classifier, embedder });

  assert.equal(other.duplicate, false);
  assert.equal(models.events.length, 2);
});

test('outbound failures are recorded as failed, never delivered', async () => {
  const models = createFakeModels();
  const event = await recordOutboundMessage({
    userId: 'tenant-a',
    provider: 'whatsapp',
    accountId: 'phone-1',
    recipient: '919999999999',
    text: 'Hello',
    deliveryStatus: 'failed',
    error: 'Provider unavailable',
  }, { DecisionEventModel: models.DecisionEventModel, embedder });

  assert.equal(event.content.deliveryStatus, 'failed');
  assert.equal(event.content.error, 'Provider unavailable');
  assert.equal(event.status, 'PENDING');
});

test('conversation listing is tenant scoped', async () => {
  const models = createFakeModels();
  await saveInboundMessage({
    userId: 'tenant-a',
    provider: 'whatsapp',
    accountId: 'phone-1',
    externalMessageId: 'a-1',
    senderId: '111',
    senderPhone: '111',
    text: 'A',
  }, { ...models, classifier, embedder });
  await saveInboundMessage({
    userId: 'tenant-b',
    provider: 'whatsapp',
    accountId: 'phone-2',
    externalMessageId: 'b-1',
    senderId: '222',
    senderPhone: '222',
    text: 'B',
  }, { ...models, classifier, embedder });

  const forA = await listConversations('tenant-a', {}, models);
  const forB = await listConversations('tenant-b', {}, models);

  assert.equal(forA.length, 1);
  assert.equal(forB.length, 1);
  assert.equal(forA[0].messages[0].content.text, 'A');
  assert.equal(forB[0].messages[0].content.text, 'B');
  assert.equal(forA[0].messages[0].userId, 'tenant-a');
});
