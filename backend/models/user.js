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
  whatsappPhoneNumberId: { type: String, default: null },

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

  // ── Gmail Webhooks (OAuth) ──
  googleAccessToken:    { type: String, default: null },
  googleRefreshToken:   { type: String, default: null },
  googleTokenExpiry:    { type: Number, default: null },
  googleEmail:          { type: String, default: null },
  lastGmailHistoryId:   { type: String, default: null }, // Tracks last processed historyId

}, { timestamps: true });

// Keep real WhatsApp phone-number IDs unique while allowing multiple users
// who have not connected WhatsApp (null values).
UserSchema.index(
  { whatsappPhoneNumberId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      whatsappPhoneNumberId: { $type: "string" }
    },
    name: "uniq_whatsappPhoneNumberId_string"
  }
);

// Gmail address is optional until the user connects Gmail. Only actual string
// addresses participate in uniqueness; null values are intentionally excluded.
UserSchema.index(
  { googleEmail: 1 },
  {
    unique: true,
    partialFilterExpression: {
      googleEmail: { $type: "string" }
    },
    name: "uniq_googleEmail_string"
  }
);

module.exports = mongoose.model('User', UserSchema);
