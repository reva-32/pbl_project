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
    enum: ['email', 'whatsapp', 'sms', 'phone'],
    default: 'email'
  }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
