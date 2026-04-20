const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  email:         { type: String, required: true, unique: true },
  password:      { type: String, required: true },
  companyName:   { type: String, required: true },
  ownerName:     { type: String, required: true },
  phone:         { type: String, required: true },
  businessType:  { type: String, default: "" },
  city:          { type: String, default: "" },
  gstin:         { type: String, default: "" },
  whatsappPhoneNumberId: { type: String, default: null, index: true },

  // ── Google Sheets ──
  googleSheetId: { type: String, default: null },

  // ── Settings fields (filled later in Settings page) ──
  pan:          { type: String, default: "" },
  address:      { type: String, default: "" },
  currency:     { type: String, default: "inr" },
  language:     { type: String, default: "en" },
  timezone:     { type: String, default: "ist" },
  dateFormat:   { type: String, default: "dd-mm" },
  invoicePrefix:{ type: String, default: "INV-" },
  paymentTerms: { type: String, default: "net30" },
  taxRate:      { type: Number, default: 18 },

  // ── Notification prefs ──
  notifications: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications:  { type: Boolean, default: true },
    whatsappAlerts:     { type: Boolean, default: false },
    weeklyReports:      { type: Boolean, default: true },
    paymentAlerts:      { type: Boolean, default: true },
  },

  // ── Security ──
  twoFactorEnabled: { type: Boolean, default: false },
  loginAlerts:      { type: Boolean, default: true },

}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
