const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Important for tenancy filtering
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  address: {
    type: String
  },
  preferredChannel: {
    type: String,
    // facebook/instagram were added for the Smart Inbox channel integrations.
    enum: ['email', 'whatsapp', 'sms', 'phone', 'facebook', 'instagram'],
    default: 'email'
  }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
