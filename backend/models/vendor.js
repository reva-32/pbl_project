const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
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
  reliabilityScore: {
    type: Number,
    default: 100, // 0 to 100
    min: 0,
    max: 100
  },
  avgDeliveryDays: {
    type: Number,
    default: 0
  },
  address: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);
