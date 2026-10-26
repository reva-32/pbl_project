const User = require('../models/user');
const IntegrationConnection = require('../models/integrationConnection');
const {
  saveInboundMessage,
  updateDeliveryStatus,
} = require('../services/inboxService');
const { verifyMetaSignature, verifyGooglePubSub } = require('../middleware/webhookSecurity');
const {
  getAuthedGmail,
  parseGmailMessage,
  extractEmail,
  extractName,
  persistRefreshedTokens,
} = require('../services/providers/gmailClient');
const { safeEqual } = require('../utils/secretBox');
const env = require('../config/env');

/**
 * Handle Meta Webhook Verification (required by Meta).
 * The verify token is never logged.
 */
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!env.metaVerifyToken) {
    console.error('❌ META_VERIFY_TOKEN / WHATSAPP_VERIFY_TOKEN is not configured');
    return res.sendStatus(503);
  }
  if (mode === 'subscribe' && safeEqual(token, env.metaVerifyToken)) {
    return res.status(200).send(String(challenge || ''));
  }
  return res.sendStatus(403);
};

function whatsAppText(message) {
  if (!message) return '';
  if (message.type === 'text') return message.text?.body || '';
  if (message.type === 'button') return message.button?.text || '';
  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.title
      || message.interactive?.list_reply?.title
      || '';
  }
  if (message.type === 'image') return message.image?.caption || '[Image]';
  if (message.type === 'video') return message.video?.caption || '[Video]';
  if (message.type === 'audio') return '[Audio message]';
  if (message.type === 'document') return message.document?.caption || '[Document]';
  if (message.type === 'sticker') return '[Sticker]';
  if (message.type === 'location') return '[Location shared]';
  return '';
}

function metaText(message) {
  if (!message) return '';
  if (typeof message.text === 'string' && message.text) return message.text;
  if (Array.isArray(message.attachments) && message.attachments.length) {
    return message.attachments.map((a) => `[${a.type || 'attachment'}]`).join(' ');
  }
  return '';
}

async function processWhatsAppEntry(entry) {
  let processed = 0;
  for (const change of entry.changes || []) {
    const value = change.value || {};
    const phoneNumberId = value.metadata?.phone_number_id;
    if (!phoneNumberId) continue;

    // Per-tenant routing: only the business that verified this phone id owns it.
    const connection = await IntegrationConnection.findOne({
      provider: 'whatsapp',
      externalAccountId: String(phoneNumberId),
      status: 'connected',
    });
    if (!connection) {
      console.warn('⚠️ WhatsApp webhook for an unconnected phone number id');
      continue;
    }

    const contactName = value.contacts?.[0]?.profile?.name || '';

    for (const message of value.messages || []) {
      const text = whatsAppText(message);
      if (!message.from || !message.id) continue;
      await saveInboundMessage({
        userId: connection.userId,
        provider: 'whatsapp',
        accountId: String(phoneNumberId),
        externalMessageId: message.id,
        senderId: message.from,
        senderName: contactName,
        senderPhone: message.from,
        text,
        timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
        metadata: { messageType: message.type },
      });
      processed += 1;
    }

    for (const status of value.statuses || []) {
      if (!status.id) continue;
      await updateDeliveryStatus({
        userId: connection.userId,
        provider: 'whatsapp',
        providerMessageId: status.id,
        deliveryStatus: status.status,
        error: status.errors?.[0]?.title || status.errors?.[0]?.message || null,
      });
    }
  }
  return processed;
}

async function processMessengerEntry(entry, provider) {
  let processed = 0;
  const pageId = entry.id;
  if (!pageId) return 0;

  const connection = await IntegrationConnection.findOne({
    provider,
    externalAccountId: String(pageId),
    status: 'connected',
  });
  if (!connection) {
    console.warn(`⚠️ ${provider} webhook for an unconnected account`);
    return 0;
  }

  for (const item of entry.messaging || []) {
    const senderId = item.sender?.id;
    const message = item.message;

    // Delivery/read receipts for an outbound message.
    if (item.delivery?.mids?.length) {
      for (const mid of item.delivery.mids) {
        await updateDeliveryStatus({
          userId: connection.userId,
          provider,
          providerMessageId: mid,
          deliveryStatus: 'delivered',
        });
      }
      continue;
    }
    if (item.read?.mid) {
      await updateDeliveryStatus({
        userId: connection.userId,
        provider,
        providerMessageId: item.read.mid,
        deliveryStatus: 'read',
      });
      continue;
    }

    if (!message || message.is_echo || !senderId || senderId === pageId) continue;
    if (!message.mid) continue;

    const text = metaText(message);
    await saveInboundMessage({
      userId: connection.userId,
      provider,
      accountId: String(pageId),
      externalMessageId: message.mid,
      senderId,
      senderName: '',
      senderPhone: '',
      text,
      timestamp: item.timestamp ? new Date(Number(item.timestamp)) : new Date(),
      metadata: {
        attachments: message.attachments || [],
        pageId: String(pageId),
      },
    });
    processed += 1;
  }
  return processed;
}

/**
 * Receive Meta notifications for WhatsApp / Messenger / Instagram.
 * Every event is matched to a verified IntegrationConnection — there is no
 * "first user in the database" fallback.
 */
exports.receiveNotification = async (req, res) => {
  const signature = verifyMetaSignature(req);
  if (!signature.ok) {
    if (signature.reason === 'not_configured') {
      console.error('❌ META_APP_SECRET is not configured — refusing webhook');
      return res.sendStatus(503);
    }
    console.warn('🚫 Rejected Meta webhook with an invalid signature');
    return res.sendStatus(401);
  }

  try {
    const body = req.body || {};
    let processed = 0;

    for (const entry of body.entry || []) {
      if (body.object === 'whatsapp_business_account') {
        processed += await processWhatsAppEntry(entry);
      } else if (body.object === 'page') {
        processed += await processMessengerEntry(entry, 'facebook');
      } else if (body.object === 'instagram') {
        processed += await processMessengerEntry(entry, 'instagram');
      }
    }

    if (processed > 0) {
      console.log(`✅ Processed ${processed} inbound Meta message(s)`);
    }
    return res.status(200).send('EVENT_RECEIVED');
  } catch (err) {
    // Returning 5xx asks Meta to retry; duplicate-safe storage makes that safe.
    console.error('❌ Meta webhook processing error:', err.message);
    return res.sendStatus(500);
  }
};

/**
 * Gmail Pub/Sub push handler.  Verification happens before decoding anything.
 */
exports.receiveGmailWebhook = async (req, res) => {
  const verification = await verifyGooglePubSub(req);
  if (!verification.ok) {
    if (verification.reason === 'not_configured') {
      console.error('❌ Gmail push verification is not configured — refusing webhook');
      return res.sendStatus(503);
    }
    console.warn('🚫 Rejected Gmail push notification:', verification.reason);
    return res.sendStatus(403);
  }

  // Process first: a 5xx makes Pub/Sub retry, and inbox dedupe makes retries
  // safe.  Returning 200 before processing would silently lose messages.
  try {
    const message = req.body?.message;
    if (!message?.data) return res.status(200).send('OK');

    const dataJson = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));
    const emailAddress = dataJson.emailAddress;
    const newHistoryId = dataJson.historyId ? String(dataJson.historyId) : null;
    if (!emailAddress || !newHistoryId) return res.status(200).send('OK');

    const user = await User.findOne({ googleEmail: String(emailAddress).toLowerCase() });
    if (!user || !user.googleRefreshToken) return res.status(200).send('OK');

    const { auth, gmail } = getAuthedGmail(user);
    const startHistoryId = user.lastGmailHistoryId
      ? String(user.lastGmailHistoryId)
      : String(Math.max(1, parseInt(newHistoryId, 10) - 10));

    let historyRes;
    try {
      historyRes = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        historyTypes: ['messageAdded'],
      });
    } catch (err) {
      if (err?.code === 404) {
        // Pub/Sub history windows expire; continue from the current point.
        await User.findByIdAndUpdate(user._id, { lastGmailHistoryId: newHistoryId });
        await persistRefreshedTokens(User, user._id, auth.credentials);
        return res.status(200).send('OK');
      }
      console.error('❌ Gmail history.list failed:', err.message);
      // Ask Pub/Sub to redeliver instead of dropping the notification.
      return res.status(500).send('RETRY');
    }

    let processed = 0;
    for (const history of historyRes.data.history || []) {
      for (const added of history.messagesAdded || []) {
        const messageId = added.message?.id;
        if (!messageId) continue;

        let msgRes;
        try {
          msgRes = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
        } catch (err) {
          console.warn('⚠️ Could not fetch a Gmail message:', err.message);
          continue;
        }

        const parsed = parseGmailMessage(msgRes.data, emailAddress);
        // Skip mail sent from the connected account itself.
        if (parsed.labelIds.includes('SENT')) continue;
        if (extractEmail(parsed.from) === String(emailAddress).toLowerCase()) continue;

        const senderEmail = extractEmail(parsed.from);
        await saveInboundMessage({
          userId: user._id,
          provider: 'gmail',
          accountId: String(emailAddress).toLowerCase(),
          externalMessageId: parsed.id,
          senderId: senderEmail,
          senderName: extractName(parsed.from),
          senderEmail,
          text: parsed.body || parsed.snippet,
          subject: parsed.subject,
          timestamp: parsed.date ? new Date(parsed.date) : new Date(),
          threadId: parsed.threadId,
          rfcMessageId: parsed.rfcMessageId,
          references: parsed.references,
          metadata: { labelIds: parsed.labelIds },
        });
        processed += 1;
      }
    }

    await User.findByIdAndUpdate(user._id, { lastGmailHistoryId: newHistoryId });
    await persistRefreshedTokens(User, user._id, auth.credentials);
    if (processed > 0) console.log(`✅ Saved ${processed} new Gmail message(s)`);
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Gmail webhook processing error:', err.message);
    // Permanent credential/configuration failures will never succeed on retry.
    // Acknowledge so Pub/Sub stops redelivering; the owner must reconnect.
    if (
      /invalid_grant|invalid_request|Token has been expired|refresh token/i.test(err.message || '') ||
      /INTEGRATION_ENCRYPTION_KEY/.test(err.message || '')
    ) {
      return res.status(200).send('OK');
    }
    return res.status(500).send('RETRY');
  }
};

/**
 * Legacy SendGrid/Mailgun email webhook.
 * Disabled unless EMAIL_WEBHOOK_SECRET is configured, and never falls back to
 * a random tenant.  Recipient address must match the business account.
 */
exports.receiveEmail = async (req, res) => {
  const secret = process.env.EMAIL_WEBHOOK_SECRET || '';
  const supplied = req.get('x-webhook-token') || req.query.token || '';
  if (!secret || !safeEqual(supplied, secret)) return res.sendStatus(403);

  try {
    const sender = req.body.from || 'Unknown Email';
    const recipient = req.body.to || '';
    const subject = req.body.subject || 'No Subject';
    const textBody = req.body.text || req.body.html || '';
    const cleanSender = extractEmail(sender);
    const cleanRecipient = extractEmail(Array.isArray(recipient) ? recipient[0] : recipient);

    const user = cleanRecipient
      ? await User.findOne({
          $or: [
            { email: cleanRecipient.toLowerCase() },
            { googleEmail: cleanRecipient.toLowerCase() },
          ],
        })
      : null;

    if (!user) {
      console.warn('⚠️ Email webhook recipient does not match a business account');
      return res.status(200).send('OK');
    }

    await saveInboundMessage({
      userId: user._id,
      provider: 'gmail',
      accountId: cleanRecipient.toLowerCase(),
      externalMessageId: req.body.message_id || req.body['message-id'] || `${cleanSender}:${Date.now()}`,
      senderId: cleanSender,
      senderName: extractName(sender),
      senderEmail: cleanSender,
      text: textBody,
      subject,
      timestamp: new Date(),
      metadata: { source: 'email-webhook' },
    });
    return res.status(200).send('OK');
  } catch (err) {
    console.error('❌ Email webhook error:', err.message);
    return res.sendStatus(500);
  }
};
