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
        enum: ['PENDING', 'PAID', 'DISCARDED', 'APPROVED', 'REJECTED', 'EXECUTED', 'RESOLVED'],
    },
    timestamp: { type: Date, default: Date.now },
});

// The 3rd argument forces the exact collection name in MongoDB
module.exports = mongoose.model('DecisionEvent', decisionSchema, 'decision_events');