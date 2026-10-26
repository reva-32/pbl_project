const mongoose = require('mongoose');

/**
 * A channel account connected to exactly one tenant (business).
 *
 * provider:            gmail | whatsapp | facebook | instagram
 * externalAccountId:   Gmail address / WhatsApp phone_number_id / Page id / IG id
 *
 * Credentials are stored encrypted by utils/secretBox.  They are never
 * returned by the API; use toSafeJSON() for client responses.
 */
const connectionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  provider: {
    type: String,
    enum: ['gmail', 'whatsapp', 'facebook', 'instagram'],
    required: true,
    index: true,
  },
  externalAccountId: {
    type: String,
    required: true,
    trim: true,
  },
  displayName: {
    type: String,
    default: '',
    trim: true,
  },
  status: {
    type: String,
    enum: ['connected', 'pending', 'error', 'disconnected'],
    default: 'connected',
    index: true,
  },
  credentials: {
    accessToken:  { type: String, default: null },
    refreshToken: { type: String, default: null },
    tokenExpiry:  { type: Number, default: null },
  },
  metadata: {
    type: Object,
    default: {},
  },
  lastError: { type: String, default: null },
  connectedAt: { type: Date, default: Date.now },
  lastEventAt: { type: Date, default: null },
}, { timestamps: true });

// One provider account can only belong to one business.
connectionSchema.index(
  { provider: 1, externalAccountId: 1 },
  { unique: true, name: 'uniq_provider_account' }
);
connectionSchema.index({ userId: 1, provider: 1 });

connectionSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id.toString(),
    provider: this.provider,
    externalAccountId: this.externalAccountId,
    displayName: this.displayName,
    status: this.status,
    lastError: this.lastError || null,
    connectedAt: this.connectedAt,
    lastEventAt: this.lastEventAt,
    metadata: {
      phoneNumber: this.metadata?.phoneNumber || null,
      wabaId: this.metadata?.wabaId || null,
      pageId: this.metadata?.pageId || null,
      username: this.metadata?.username || null,
    },
  };
};

module.exports = mongoose.model('IntegrationConnection', connectionSchema);
