const DecisionEvent = require('../models/DecisionEvent');
const { classifyMessage } = require('../services/aiClassifier');
const { getEmbedding } = require('../services/ragService');

/**
 * Handle Meta Webhook Verification (required by Meta).
 */
exports.verifyWebhook = (req, res) => {
    const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'msme360_secret';
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log(`🔍 Webhook Verification Attempt:`);
    console.log(`- Mode: ${mode}`);
    console.log(`- Received Token: "${token}"`);
    console.log(`- Expected Token: "${VERIFY_TOKEN}"`);

    if (mode && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verified by Meta.');
        return res.status(200).send(challenge);
    }
    console.error('❌ Webhook verification failed. Token mismatch.');
    res.sendStatus(403);
};

/**
 * Receive and process incoming Meta notifications (webhooks).
 */
exports.receiveNotification = async (req, res) => {
    try {
        console.log('📥 Incoming Meta Webhook Notification:', JSON.stringify(req.body, null, 2));
        
        // Structure for WhatsApp / Messenger / Instagram varies slightly
        // We will simplify for this implementation
        const entry = req.body?.entry?.[0];
        const value = entry?.changes?.[0]?.value;
        const messageObj = value?.messages?.[0] || entry?.messaging?.[0];

        if (!messageObj) {
            return res.status(200).send('EVENT_RECEIVED');
        }

        const senderId = messageObj.from || messageObj.sender?.id || 'Unknown Sender';
        const messageText = messageObj.text?.body || messageObj.message?.text || '';
        
        // Better platform detection
        let platform = 'Meta';
        if (value?.messaging_product === 'whatsapp' || entry?.id?.includes('whatsapp')) {
            platform = 'WhatsApp';
        } else if (entry?.messaging) {
            // Messenger / Instagram usually have 'messaging' array
            platform = 'Messenger';
        }

        if (!messageText) return res.status(200).send('EVENT_RECEIVED');

        console.log(`💬 Message from ${senderId} on ${platform}: "${messageText.substring(0, 30)}..."`);

        // 1. AI Analysis (Classification & Summary)
        const analysis = await classifyMessage(messageText);

        // 2. Vector Store (for RAG recall)
        const embedding = await getEmbedding(`${platform} Message from ${senderId}: ${messageText}`);

        // 3. Map to the correct user
        const User = require('../models/user');
        let targetUserId = null;

        // Extract potential IDs for matching from Meta payload
        const wabaId = entry?.id; // WhatsApp Business Account ID
        const phoneNumberId = value?.metadata?.phone_number_id; // Specific Phone Number ID

        console.log(`🔍 Attempting to match user for Platform: ${platform}`);
        console.log(`- WABA ID (entry.id): ${wabaId}`);
        console.log(`- Phone Number ID (metadata): ${phoneNumberId}`);

        if (phoneNumberId || wabaId) {
            // Build query dynamically to exclude null/undefined IDs
            const orQuery = [];
            if (phoneNumberId) orQuery.push({ whatsappPhoneNumberId: phoneNumberId });
            if (wabaId) orQuery.push({ whatsappPhoneNumberId: wabaId });

            const matchedUser = await User.findOne({ $or: orQuery });

            if (matchedUser) {
                console.log(`✅ Matched User: ${matchedUser.email} [${matchedUser._id}]`);
                targetUserId = matchedUser._id;
            }
        }

        // Fallback for testing/backwards compatibility if no user matched
        if (!targetUserId) {
            console.warn(`⚠️  No user matched. Falling back to first user in database.`);
            const firstUser = await User.findOne().sort({ createdAt: 1 });
            targetUserId = firstUser ? firstUser._id : '65f1a2b3c4d5e6f7a8b9c0d1';
        }

        // 4. Save as DecisionEvent (Smart Message)
        const newMsg = new DecisionEvent({
            userId: targetUserId,
            type: 'CUSTOMER_MSG',
            content: {
                sender: senderId,
                text: messageText,
                platform: platform,
                summary: analysis.summary,
                category: analysis.category,
                priority: analysis.priority,
                isRead: false
            },
            embedding: embedding,
            timestamp: new Date()
        });

        await newMsg.save();
        console.log(`✅ Analyzed and stored: [${analysis.category}] ${analysis.summary}`);

        res.status(200).send('EVENT_RECEIVED');
    } catch (err) {
        console.error('❌ Webhook Processing Error:', err.message);
        res.status(200).send('EVENT_RECEIVED'); // Still send 200 back to Meta to avoid retry loop
    }
};

/**
 * Receive and process incoming Email webhooks (e.g. from SendGrid or Mailgun).
 */
exports.receiveEmail = async (req, res) => {
    try {
        console.log('📧 Incoming Email Webhook Received');
        
        // SendGrid/Mailgun usually send text in req.body.text, sender in req.body.from
        const sender = req.body.from || 'Unknown Email';
        const subject = req.body.subject || 'No Subject';
        const textBody = req.body.text || req.body.html || '';

        console.log(`💬 Email from ${sender}: "${subject}"`);

        // 1. AI Analysis
        const analysis = await classifyMessage(`Subject: ${subject}\n\n${textBody}`);

        // 2. Vector Store Embedding
        const embedding = await getEmbedding(`Email from ${sender}: ${subject} - ${textBody}`);

        // 3. User Matching
        const User = require('../models/user');
        // Extract pure email from "John Doe <john@example.com>"
        const emailMatch = sender.match(/<([^>]+)>/);
        const cleanEmail = emailMatch ? emailMatch[1] : sender;
        
        let targetUserId = null;
        const matchedUser = await User.findOne({ email: cleanEmail });
        
        if (matchedUser) {
            targetUserId = matchedUser._id;
        } else {
            // Fallback user
            const firstUser = await User.findOne().sort({ createdAt: 1 });
            targetUserId = firstUser ? firstUser._id : '65f1a2b3c4d5e6f7a8b9c0d1';
        }

        // 4. Save as DecisionEvent (Smart Message)
        const newMsg = new DecisionEvent({
            userId: targetUserId,
            type: 'CUSTOMER_MSG',
            content: {
                sender: cleanEmail,
                text: `Subject: ${subject}\n\n${textBody}`,
                platform: 'Email',
                summary: analysis.summary,
                category: analysis.category,
                priority: analysis.priority,
                isRead: false
            },
            embedding: embedding,
            timestamp: new Date()
        });

        await newMsg.save();
        console.log(`✅ Analyzed and stored Email: [${analysis.category}] ${analysis.summary}`);

        // Acknowledge receipt
        res.status(200).send('OK');
    } catch (err) {
        console.error('❌ Email Webhook Error:', err.message);
        res.status(200).send('OK'); // Return 200 so the provider doesn't retry infinitely
    }
};

/**
 * Receive and process incoming Gmail Pub/Sub Webhooks
 */
exports.receiveGmailWebhook = async (req, res) => {
    try {
        const message = req.body.message;
        if (!message || !message.data) {
            console.error('❌ Invalid Pub/Sub message received');
            return res.status(400).send('Bad Request');
        }

        // 1. Decode Pub/Sub Data
        const dataBuffer = Buffer.from(message.data, 'base64');
        const dataJson = JSON.parse(dataBuffer.toString('utf-8'));
        
        const emailAddress = dataJson.emailAddress;
        const historyId = dataJson.historyId;

        console.log(`📧 Gmail Push Notification for: ${emailAddress} (History ID: ${historyId})`);

        // 2. Find User and get Tokens
        const User = require('../models/user');
        const user = await User.findOne({ 
            $or: [
                { email: emailAddress },
                { googleEmail: emailAddress }
            ]
        });
        if (!user || !user.googleRefreshToken) {
            console.warn(`⚠️ User not found or not connected to Gmail: ${emailAddress}`);
            return res.status(200).send('OK'); // Acknowledge to Pub/Sub to stop retries
        }

        // 3. Setup OAuth2 Client
        const { google } = require('googleapis');
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_REDIRECT_URI
        );

        oauth2Client.setCredentials({
            access_token: user.googleAccessToken,
            refresh_token: user.googleRefreshToken,
            expiry_date: user.googleTokenExpiry
        });

        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

        // 4. Fetch the newly added messages
        const historyRes = await gmail.users.history.list({
            userId: 'me',
            startHistoryId: Math.max(1, parseInt(historyId) - 1000).toString(), // A bit before the current historyId to be safe
            historyTypes: ['messageAdded']
        });

        const histories = historyRes.data.history || [];
        for (const history of histories) {
            const messagesAdded = history.messagesAdded || [];
            for (const msgAdded of messagesAdded) {
                const messageId = msgAdded.message.id;
                
                // 5. Fetch full message content
                const msgRes = await gmail.users.messages.get({
                    userId: 'me',
                    id: messageId,
                    format: 'full'
                });

                const headers = msgRes.data.payload.headers;
                const subjectHeader = headers.find(h => h.name === 'Subject');
                const fromHeader = headers.find(h => h.name === 'From');
                
                const subject = subjectHeader ? subjectHeader.value : 'No Subject';
                const from = fromHeader ? fromHeader.value : 'Unknown Sender';
                
                // Extract plain text body (simplified extraction)
                let body = '';
                if (msgRes.data.payload.parts) {
                    const textPart = msgRes.data.payload.parts.find(p => p.mimeType === 'text/plain');
                    if (textPart && textPart.body.data) {
                        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8');
                    }
                } else if (msgRes.data.payload.body && msgRes.data.payload.body.data) {
                    body = Buffer.from(msgRes.data.payload.body.data, 'base64').toString('utf-8');
                }

                // Ignore emails sent by the user themselves
                if (from.includes(emailAddress)) {
                    continue;
                }

                console.log(`💬 New Email from ${from}: "${subject}"`);

                // 6. AI Analysis & Embeddings
                const analysis = await classifyMessage(`Subject: ${subject}\n\n${body}`);
                const embedding = await getEmbedding(`Email from ${from}: ${subject} - ${body}`);

                // 7. Save to Database
                const newMsg = new DecisionEvent({
                    userId: user._id,
                    type: 'CUSTOMER_MSG',
                    content: {
                        sender: from,
                        text: `Subject: ${subject}\n\n${body}`,
                        platform: 'Email',
                        summary: analysis.summary,
                        category: analysis.category,
                        priority: analysis.priority,
                        isRead: false,
                        gmailMessageId: messageId // Store this to allow replying later
                    },
                    embedding: embedding,
                    timestamp: new Date()
                });

                await newMsg.save();
                console.log(`✅ Analyzed and stored Gmail: [${analysis.category}] ${analysis.summary}`);
            }
        }

        // Update tokens in DB if they were refreshed
        const newTokens = oauth2Client.credentials;
        if (newTokens.access_token !== user.googleAccessToken) {
            await User.findByIdAndUpdate(user._id, {
                googleAccessToken: newTokens.access_token,
                googleTokenExpiry: newTokens.expiry_date
            });
        }

        res.status(200).send('OK');

    } catch (err) {
        console.error('❌ Gmail Webhook Error:', err.message);
        res.status(200).send('OK'); // Always return 200 to Pub/Sub to prevent exponential backoff retries if it's our processing error
    }
};
