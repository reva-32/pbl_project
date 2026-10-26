const DecisionEvent = require('../models/DecisionEvent');
const User = require('../models/user');
const IntegrationConnection = require('../models/integrationConnection');
const { decryptSecret } = require('../utils/secretBox');
const { extractEmail, sendGmailReply } = require('../services/providers/gmailClient');
const graph = require('../services/providers/graphClient');
const { ProviderError } = graph;
const {
  recordOutboundMessage,
  isOutbound,
  listConversations,
} = require('../services/inboxService');

const MAX_REPLY_LENGTH = 4000;

function providerFromEvent(event) {
  const content = event.content || {};
  if (content.provider) return content.provider;
  const platform = String(content.platform || '').toLowerCase();
  if (platform === 'whatsapp') return 'whatsapp';
  if (platform === 'instagram') return 'instagram';
  if (platform === 'facebook' || platform === 'messenger') return 'facebook';
  if (platform === 'email' || platform === 'gmail') return 'gmail';
  return null;
}

function safeProviderMessage(err) {
  if (err instanceof ProviderError) {
    if (err.status === 401 || err.status === 403 || err.code === 190) {
      return { status: 409, message: 'The channel connection has expired. Please reconnect it in Integrations.' };
    }
    if (err.status === 429 || err.retryable) {
      return { status: 429, message: 'The provider is rate limiting requests. Please try again shortly.' };
    }
    return { status: 502, message: err.message || 'The provider rejected the message.' };
  }
  if (/INTEGRATION_ENCRYPTION_KEY/.test(err.message || '')) {
    return { status: 503, message: 'Server encryption key is not configured.' };
  }
  if (/invalid_grant|invalid_request|Token has been expired|refresh token/i.test(err.message || '')) {
    return { status: 409, message: 'The Gmail connection has expired. Please reconnect it in Integrations.' };
  }
  return { status: 502, message: 'The message could not be delivered. Please try again.' };
}

async function findConnectionForEvent(userId, event, provider) {
  if (!['whatsapp', 'facebook', 'instagram'].includes(provider)) return null;
  const accountId = event.content?.accountId;
  if (accountId) {
    return IntegrationConnection.findOne({
      userId,
      provider,
      externalAccountId: String(accountId),
      status: 'connected',
    });
  }
  // Legacy event without account metadata: use the tenant's only connection
  // for that provider.  Never cross tenant boundaries.
  const connections = await IntegrationConnection.find({ userId, provider, status: 'connected' }).limit(2);
  return connections.length === 1 ? connections[0] : null;
}

function normalizeWhatsAppRecipient(value) {
  const digits = String(value || '').replace(/[^\d]/g, '');
  return /^\d{6,20}$/.test(digits) ? digits : '';
}

/**
 * POST /api/messages/reply
 * Body: { eventId, message }
 *
 * Sends through the original channel and records the real delivery outcome.
 */
exports.sendReply = async (req, res) => {
  const { eventId, message } = req.body || {};
  const text = String(message || '').trim();

  if (!eventId || !text) {
    return res.status(400).json({ error: 'Missing eventId or message content.' });
  }
  if (text.length > MAX_REPLY_LENGTH) {
    return res.status(400).json({ error: `Replies are limited to ${MAX_REPLY_LENGTH} characters.` });
  }

  try {
    // Tenant-scoped lookup: another business's event returns 404.
    const originalEvent = await DecisionEvent.findOne({ _id: eventId, userId: req.userId });
    if (!originalEvent) {
      return res.status(404).json({ error: 'Original message not found.' });
    }
    if (isOutbound(originalEvent)) {
      return res.status(400).json({ error: 'You can only reply to an inbound message.' });
    }

    const provider = providerFromEvent(originalEvent);
    if (!provider) {
      return res.status(400).json({ error: 'This message has no supported channel to reply through.' });
    }

    const content = originalEvent.content || {};
    const accountId = content.accountId || '';
    let providerMessageId = null;
    let threadId = content.threadId || null;
    let recipient = '';

    if (provider === 'gmail') {
      const user = await User.findById(req.userId);
      if (!user || !user.googleRefreshToken) {
        return res.status(409).json({ error: 'Gmail is not connected. Reconnect it in Integrations.' });
      }
      recipient = content.senderEmail || extractEmail(content.sender);
      if (!recipient) return res.status(400).json({ error: 'This email has no reply address.' });

      try {
        const sent = await sendGmailReply({ User, user, event: originalEvent, text });
        providerMessageId = sent.providerMessageId;
        threadId = sent.threadId || threadId;
      } catch (err) {
        const mapped = safeProviderMessage(err);
        await recordOutboundMessage({
          userId: req.userId,
          provider: 'gmail',
          accountId: user.googleEmail || '',
          conversationId: content.conversationId,
          customerId: content.customerId,
          recipient,
          text,
          deliveryStatus: 'failed',
          error: mapped.message,
          subject: content.subject || '',
          threadId,
        }).catch(() => {});
        console.error('❌ Gmail send failed:', err.message);
        return res.status(mapped.status).json({ error: mapped.message });
      }
    } else {
      const connection = await findConnectionForEvent(req.userId, originalEvent, provider);
      if (!connection) {
        return res.status(409).json({
          error: `${provider === 'whatsapp' ? 'WhatsApp' : provider === 'instagram' ? 'Instagram' : 'Facebook'} is not connected for this account. Reconnect it in Integrations.`,
        });
      }

      const accessToken = decryptSecret(connection.credentials?.accessToken);
      if (!accessToken) {
        return res.status(409).json({ error: 'The channel connection has no usable credentials. Please reconnect.' });
      }
      recipient = content.senderId || content.senderPhone || content.sender;

      try {
        if (provider === 'whatsapp') {
          const to = normalizeWhatsAppRecipient(recipient);
          if (!to) return res.status(400).json({ error: 'The customer phone number is not valid for WhatsApp.' });
          const result = await graph.sendWhatsAppText({
            phoneNumberId: connection.externalAccountId,
            accessToken,
            to,
            text,
          });
          providerMessageId = result.messages?.[0]?.id || null;
          recipient = to;
        } else if (provider === 'facebook') {
          if (!recipient) return res.status(400).json({ error: 'The Messenger recipient is missing.' });
          const result = await graph.sendMessengerText({
            pageId: connection.metadata?.pageId || connection.externalAccountId,
            accessToken,
            recipientId: recipient,
            text,
          });
          providerMessageId = result.message_id || null;
        } else if (provider === 'instagram') {
          if (!recipient) return res.status(400).json({ error: 'The Instagram recipient is missing.' });
          const result = await graph.sendInstagramText({
            igAccountId: connection.externalAccountId,
            accessToken,
            recipientId: recipient,
            text,
          });
          providerMessageId = result.message_id || null;
        }
      } catch (err) {
        // Record the failure honestly, then return a safe error.
        const mapped = safeProviderMessage(err);
        await recordOutboundMessage({
          userId: req.userId,
          provider,
          accountId: connection.externalAccountId,
          conversationId: content.conversationId,
          customerId: content.customerId,
          recipient: String(recipient || ''),
          text,
          deliveryStatus: 'failed',
          error: mapped.message,
          subject: content.subject || '',
          threadId,
        }).catch(() => {});

        await IntegrationConnection.updateOne(
          { _id: connection._id, userId: req.userId },
          { $set: { lastError: mapped.message } }
        ).catch(() => {});

        console.error(`❌ ${provider} send failed:`, err.message);
        return res.status(mapped.status).json({ error: mapped.message });
      }
    }

    // Success: persist the outbound message and resolve the inbound thread.
    const outbound = await recordOutboundMessage({
      userId: req.userId,
      provider,
      accountId: accountId || (provider === 'gmail' ? (await User.findById(req.userId).select('googleEmail'))?.googleEmail : ''),
      conversationId: content.conversationId,
      customerId: content.customerId,
      recipient,
      text,
      providerMessageId,
      deliveryStatus: 'sent',
      subject: content.subject || '',
      threadId,
    });

    originalEvent.status = 'RESOLVED';
    originalEvent.content.isRead = true;
    if (!Array.isArray(originalEvent.content.replies)) originalEvent.content.replies = [];
    originalEvent.content.replies.push({ text, timestamp: new Date(), providerMessageId });
    originalEvent.markModified('content');
    await originalEvent.save();

    return res.status(200).json({
      success: true,
      message: `Reply sent via ${provider === 'gmail' ? 'Gmail' : provider === 'facebook' ? 'Messenger' : provider === 'instagram' ? 'Instagram' : 'WhatsApp'}.`,
      deliveryStatus: 'sent',
      providerMessageId,
      outboundEventId: outbound?._id || null,
    });
  } catch (err) {
    console.error('❌ Reply error:', err.message);
    const mapped = safeProviderMessage(err);
    return res.status(mapped.status).json({ error: mapped.message });
  }
};

/** GET /api/messages/conversations — tenant-scoped conversation view. */
exports.conversations = async (req, res) => {
  try {
    const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 500));
    const conversations = await listConversations(req.userId, { limit });
    res.json({ conversations });
  } catch (err) {
    console.error('❌ Conversations error:', err.message);
    res.status(500).json({ error: 'Could not load conversations' });
  }
};
