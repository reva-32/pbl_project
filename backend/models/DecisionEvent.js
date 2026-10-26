const mongoose = require('mongoose');

const decisionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    type: {
        type: String,
        required: true,
        // Extended enum to cover all types produced by OCR auto-categorization
        enum: [
            'VENDOR_ORDER',
            'INVOICE',
            'CUSTOMER_MSG',
            'INTERNAL_NOTE',
            'VENDOR_HISTORY',
            'CONTRACT',
            'RECEIPT',
            'SCANNED_DOC',
            'CHAT_LOG',
            'DOCUMENT',
        ],
    },
    // The raw data — from email/chat/OCR
    content: {
        type: Object,
        required: true,
    },
    // The "Brain" — 384-dim sentence embedding from all-MiniLM-L6-v2
    embedding: {
        type: [Number],
        required: true,
        index: true,
    },
    status: {
        type: String,
        default: 'PENDING',
        enum: ['PENDING', 'PAID', 'DISCARDED', 'APPROVED', 'REJECTED', 'EXECUTED', 'RESOLVED', 'ARCHIVED'],
    },
    timestamp: { type: Date, default: Date.now },
});

// Provider message ids are unique per tenant. The partial index only covers
// real string ids: outbound rows without a provider id store `null` and must
// not collide with each other. Old rows without the field are also excluded.
decisionSchema.index(
    { userId: 1, 'content.provider': 1, 'content.providerMessageId': 1 },
    {
        unique: true,
        partialFilterExpression: { 'content.providerMessageId': { $type: 'string' } },
        name: 'uniq_tenant_provider_message',
    }
);
decisionSchema.index({ userId: 1, 'content.conversationId': 1, timestamp: -1 });

// The 3rd argument forces the exact collection name in MongoDB
module.exports = mongoose.model('DecisionEvent', decisionSchema, 'decision_events');