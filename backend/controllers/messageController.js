const DecisionEvent = require('../models/DecisionEvent');
const { sendWhatsAppMessage } = require('../services/whatsappService');

/**
 * Sends a reply to a customer message via WhatsApp.
 */
exports.sendReply = async (req, res) => {
    try {
        const { eventId, message } = req.body;

        if (!eventId || !message) {
            return res.status(400).json({ error: 'Missing eventId or message content.' });
        }

        // 1. Fetch the original message to get the recipient information
        const originalEvent = await DecisionEvent.findById(eventId);
        if (!originalEvent) {
            return res.status(404).json({ error: 'Original message not found.' });
        }

        const recipientPhone = originalEvent.content.sender; // The customer's phone/ID
        if (!recipientPhone) {
            return res.status(400).json({ error: 'Recipient phone number not found in message metadata.' });
        }

        console.log(`📤 Sending WhatsApp reply to ${recipientPhone}...`);

        // 2. Call the WhatsApp Service
        const response = await sendWhatsAppMessage(recipientPhone, message);

        // 3. Mark the original message as RESOLVED
        originalEvent.status = 'RESOLVED';
        
        // Add the reply to the content history (optional)
        if (!originalEvent.content.replies) originalEvent.content.replies = [];
        originalEvent.content.replies.push({
            text: message,
            timestamp: new Date()
        });
        
        // Ensure Mongoose marks the mixed object as modified
        originalEvent.markModified('content');
        await originalEvent.save();

        console.log(`✅ Reply sent and status updated to RESOLVED.`);

        res.status(200).json({ 
            success: true, 
            message: 'Reply sent successfully.',
            metaResponse: response 
        });

    } catch (err) {
        console.error('❌ Error sending WhatsApp reply:', err.message);
        res.status(500).json({ error: err.message || 'Failed to send reply via WhatsApp.' });
    }
};
