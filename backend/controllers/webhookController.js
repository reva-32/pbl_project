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
        const platform = entry?.id ? (entry.id.includes('whatsapp') ? 'WhatsApp' : 'Meta') : 'Meta';

        if (!messageText) return res.status(200).send('EVENT_RECEIVED');

        console.log(`💬 Message from ${senderId} on ${platform}: "${messageText.substring(0, 30)}..."`);

        // 1. AI Analysis (Classification & Summary)
        const analysis = await classifyMessage(messageText);

        // 2. Vector Store (for RAG recall)
        const embedding = await getEmbedding(`${platform} Message from ${senderId}: ${messageText}`);

        // 3. Find the primary user for this demo (assigning to the first user in the DB)
        const User = require('../models/user');
        let targetUserId = req.body.userId;
        if (!targetUserId) {
            const firstUser = await User.findOne();
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
