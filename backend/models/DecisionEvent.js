const mongoose = require('mongoose');

const decisionSchema = new mongoose.Schema({
    type: { 
        type: String, 
        required: true,
        enum: ['VENDOR_ORDER', 'INVOICE', 'CUSTOMER_MSG', 'INTERNAL_NOTE', 'VENDOR_HISTORY'] 
    },
    // The raw data from email/message
    content: { 
        type: Object, 
        required: true 
    },
    // The "Brain" part - Vector Embedding
    embedding: {
        type: [Number],
        required: true,
        index: true // Helps with performance
    },
    status: {
        type: String,
        default: 'PENDING', // PENDING -> APPROVED -> EXECUTED
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED']
    },
    timestamp: { type: Date, default: Date.now }
});

// The 3rd argument forces the exact collection name
module.exports = mongoose.model('DecisionEvent', decisionSchema, 'decision_events');