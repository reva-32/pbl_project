const DecisionEvent = require('../models/DecisionEvent');
const Customer = require('../models/customer');
const IntegrationConnection = require('../models/integrationConnection');
const { classifyMessage } = require('./aiClassifier');
const { getEmbedding } = require('./ragService');
const { findOrCreateCustomer } = require('./customerService');
const { retainBusinessMemory } = require('./hindsightService');

function redactContactDetails(value) {
  return String(value || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, '[email redacted]')
    .replace(/\\b(?:\\+?\\d[\\d\\s().-]{7,}\\d)\\b/g, '[phone redacted]');
}

function retainMessageMemory(retainer, userId, event, source) {
  const content = event?.content || {};
  const safeText = redactContactDetails(content.text).slice(0, 2500);
  const summary = [
    `Customer interaction via ${content.platform || 'business channel'} (${content.direction || 'inbound'}).`,
    content.category ? `Category: ${content.category}.` : '',
    content.priority ? `Priority: ${content.priority}.` : '',
    safeText ? `Message: ${safeText}` : '',
  ].filter(Boolean).join(' ');

  // Memory is secondary: never delay or fail the persisted inbox event.
  Promise.resolve()
    .then(() => retainer(userId, summary, {
      source,
      documentId: String(event._id),
      timestamp: new Date(event.timestamp || Date.now()).toISOString(),
    }))
    .catch((error) => {
      console.error('⚠️ Hindsight message retention failed:', error.message);
    });
}

const CHANNEL_LABELS = {
  gmail: 'Email',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

function channelLabel(provider) {
  return CHANNEL_LABELS[provider] || 'Message';
}

function conversationIdFor({ provider, accountId, customerIdentity }) {
  return [provider || 'unknown', accountId || 'account', customerIdentity || 'customer'].join(':');
}

function isOutbound(event) {
  return event?.content?.direction === 'outbound';
}

function isInbound(event) {
  return !isOutbound(event);
}

function dedupeQuery(userId, provider, providerMessageId) {
  const query = {
    userId,
    type: 'CUSTOMER_MSG',
    'content.provider': provider,
    'content.providerMessageId': providerMessageId,
  };
  if (provider !== 'gmail') return query;

  // Older Gmail rows used content.gmailMessageId before channel metadata
  // existed. Check both shapes so a webhook retry cannot duplicate them.
  return {
    userId,
    type: 'CUSTOMER_MSG',
    $or: [
      { 'content.provider': 'gmail', 'content.providerMessageId': providerMessageId },
      { 'content.gmailMessageId': providerMessageId },
    ],
  };
}

function inferProvider(content = {}) {
  if (content.provider) return content.provider;
  const platform = String(content.platform || '').toLowerCase();
  if (platform === 'whatsapp') return 'whatsapp';
  if (platform === 'instagram') return 'instagram';
  if (platform === 'facebook' || platform === 'messenger') return 'facebook';
  if (platform === 'email' || platform === 'gmail') return 'gmail';
  return null;
}

/**
 * Save one inbound provider message exactly once.
 *
 * `deps` exists so tests can inject fake models instead of MongoDB.
 */
async function saveInboundMessage(input, deps = {}) {
  const {
    DecisionEventModel = DecisionEvent,
    CustomerModel = Customer,
    ConnectionModel = IntegrationConnection,
    classifier = classifyMessage,
    embedder = getEmbedding,
    hindsightRetainer = retainBusinessMemory,
  } = deps;

  const {
    userId,
    provider,
    accountId,
    externalMessageId,
    senderId,
    senderName,
    senderEmail,
    senderPhone,
    text,
    subject,
    timestamp,
    threadId,
    rfcMessageId,
    references,
    metadata,
    raw,
  } = input;

  if (!userId) throw new Error('userId is required');
  if (!provider) throw new Error('provider is required');
  if (!externalMessageId) throw new Error('externalMessageId is required');

  const duplicate = await DecisionEventModel.findOne(dedupeQuery(userId, provider, String(externalMessageId)));
  if (duplicate) return { event: duplicate, duplicate: true };

  const safeText = String(text || '').trim() || '[Attachment or unsupported message type]';
  const customer = await findOrCreateCustomer(userId, {
    name: senderName,
    email: senderEmail,
    phone: senderPhone,
    provider,
    CustomerModel,
  });

  const customerIdentity = senderEmail || senderPhone || senderId || 'unknown';
  const conversationId = conversationIdFor({ provider, accountId, customerIdentity });

  const analysis = await classifier(`${subject ? `Subject: ${subject}\n\n` : ''}${safeText}`);
  const embedding = await embedder(`${channelLabel(provider)} message from ${senderName || customerIdentity}: ${safeText}`);

  const content = {
    sender: senderName || senderEmail || senderPhone || senderId || 'Unknown sender',
    senderId: senderId || null,
    senderName: senderName || '',
    senderEmail: senderEmail || '',
    senderPhone: senderPhone || '',
    text: subject ? `Subject: ${subject}\n\n${safeText}` : safeText,
    subject: subject || '',
    platform: channelLabel(provider),
    provider,
    accountId: accountId || '',
    direction: 'inbound',
    providerMessageId: String(externalMessageId),
    conversationId,
    threadId: threadId || null,
    rfcMessageId: rfcMessageId || null,
    references: references || null,
    deliveryStatus: 'received',
    isRead: false,
    summary: analysis.summary,
    category: analysis.category,
    priority: analysis.priority,
    customerId: customer?._id ? String(customer._id) : null,
    metadata: metadata || {},
  };

  // Preserve the legacy Gmail dedupe field used by older code paths.
  if (provider === 'gmail') content.gmailMessageId = String(externalMessageId);

  try {
    const event = await DecisionEventModel.create({
      userId,
      type: 'CUSTOMER_MSG',
      content,
      embedding,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
    });

    retainMessageMemory(hindsightRetainer, userId, event, 'customer_message_inbound');

    if (ConnectionModel && accountId) {
      ConnectionModel.updateOne(
        { userId, provider, externalAccountId: String(accountId) },
        { $set: { lastEventAt: new Date(), status: 'connected', lastError: null } }
      ).catch(() => {});
    }

    return { event, duplicate: false, customer };
  } catch (err) {
    // Concurrent webhook retries can race the unique index.  Return the winner.
    if (err?.code === 11000) {
      const event = await DecisionEventModel.findOne(dedupeQuery(userId, provider, String(externalMessageId)));
      return { event, duplicate: true };
    }
    throw err;
  }
}

/**
 * Record an outbound reply.  A failed send is stored as `failed` — never as
 * delivered — so the inbox tells the truth.
 */
async function recordOutboundMessage({
  userId,
  provider,
  accountId,
  conversationId,
  customerId,
  recipient,
  text,
  providerMessageId,
  deliveryStatus = 'sent',
  error = null,
  subject = '',
  threadId = null,
  metadata = {},
}, deps = {}) {
  const {
    DecisionEventModel = DecisionEvent,
    embedder = getEmbedding,
    hindsightRetainer = retainBusinessMemory,
  } = deps;

  const embedding = await embedder(`Outbound ${channelLabel(provider)} message to ${recipient || 'customer'}: ${text}`);
  const content = {
    sender: 'You',
    recipient: recipient || '',
    text: subject ? `Subject: ${subject}\n\n${text}` : text,
    subject,
    platform: channelLabel(provider),
    provider,
    accountId: accountId || '',
    direction: 'outbound',
    conversationId: conversationId || '',
    providerMessageId: providerMessageId || null,
    threadId,
    deliveryStatus,
    error,
    isRead: true,
    summary: deliveryStatus === 'failed' ? `Reply failed: ${error || 'provider error'}` : 'Reply sent',
    category: 'GENERAL',
    priority: 'LOW',
    customerId: customerId || null,
    metadata,
  };

  const event = await DecisionEventModel.create({
    userId,
    type: 'CUSTOMER_MSG',
    content,
    embedding,
    status: deliveryStatus === 'failed' ? 'PENDING' : 'RESOLVED',
    timestamp: new Date(),
  });

  // Only successful replies become business memories; failed sends are not customer communications.
  if (deliveryStatus === 'sent') {
    retainMessageMemory(hindsightRetainer, userId, event, 'customer_message_outbound');
  }
  return event;
}

async function updateDeliveryStatus({ userId, provider, providerMessageId, deliveryStatus, error = null }, deps = {}) {
  const { DecisionEventModel = DecisionEvent } = deps;
  if (!userId || !providerMessageId) return null;
  return DecisionEventModel.findOneAndUpdate(
    {
      userId,
      'content.provider': provider,
      'content.providerMessageId': String(providerMessageId),
    },
    {
      $set: {
        'content.deliveryStatus': deliveryStatus,
        'content.error': error,
      },
    },
    { new: true }
  );
}

/** Group a tenant's messages into conversations for the Smart Inbox UI. */
async function listConversations(userId, { limit = 500 } = {}, deps = {}) {
  const {
    DecisionEventModel = DecisionEvent,
    CustomerModel = Customer,
  } = deps;

  const events = await DecisionEventModel.find({ userId, type: 'CUSTOMER_MSG' })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  const groups = new Map();
  for (const event of events) {
    const content = event.content || {};
    const inferredProvider = inferProvider(content);
    const key = content.conversationId
      || `${inferredProvider || content.platform || 'unknown'}:${content.sender || 'unknown'}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        provider: inferredProvider,
        platform: content.platform || 'Message',
        accountId: content.accountId || null,
        customerId: content.customerId || null,
        messages: [],
      });
    }
    groups.get(key).messages.push(event);
  }

  const customerIds = [...groups.values()].map((g) => g.customerId).filter(Boolean);
  const customers = customerIds.length
    ? await CustomerModel.find({ userId, _id: { $in: customerIds } }).lean()
    : [];
  const customerById = new Map(customers.map((c) => [String(c._id), c]));

  const conversations = [...groups.values()].map((group) => {
    const messages = group.messages
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    const inbound = messages.filter(isInbound);
    const last = messages[messages.length - 1];
    const unread = inbound.filter((m) => m.status === 'PENDING' && m.content?.isRead !== true).length;
    const customer = group.customerId ? customerById.get(String(group.customerId)) : null;

    return {
      id: group.id,
      provider: group.provider,
      platform: group.platform,
      accountId: group.accountId,
      customer: customer
        ? { id: String(customer._id), name: customer.name, email: customer.email || '', phone: customer.phone || '' }
        : {
            id: null,
            name: last?.content?.senderName || last?.content?.senderEmail || last?.content?.sender || 'Unknown customer',
            email: last?.content?.senderEmail || '',
            phone: last?.content?.senderPhone || '',
          },
      lastMessage: last ? {
        id: last._id,
        text: last.content?.text || '',
        timestamp: last.timestamp,
        direction: last.content?.direction || 'inbound',
        deliveryStatus: last.content?.deliveryStatus || null,
      } : null,
      unreadCount: unread,
      status: inbound.some((m) => m.status === 'PENDING') ? 'PENDING' : 'RESOLVED',
      messages,
    };
  });

  conversations.sort((a, b) => {
    const at = new Date(a.lastMessage?.timestamp || 0).getTime();
    const bt = new Date(b.lastMessage?.timestamp || 0).getTime();
    return bt - at;
  });

  return conversations;
}

module.exports = {
  channelLabel,
  conversationIdFor,
  isInbound,
  isOutbound,
  saveInboundMessage,
  recordOutboundMessage,
  updateDeliveryStatus,
  listConversations,
};
