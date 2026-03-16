const mongoose = require('mongoose');

// ── Plan definitions (your product's pricing tiers) ──
const PLANS = {
  free_trial: {
    name: "Free Trial",
    price: 0,
    durationDays: 14,
    limits: {
      messages: 500,
      aiQueries: 50,
      invoices: 10,
      teamMembers: 1,
    },
  },
  starter: {
    name: "Starter",
    price: 999,
    durationDays: 30,
    limits: {
      messages: 3000,
      aiQueries: 300,
      invoices: 50,
      teamMembers: 2,
    },
  },
  professional: {
    name: "Professional",
    price: 2999,
    durationDays: 30,
    limits: {
      messages: 10000,
      aiQueries: 1000,
      invoices: -1, // unlimited
      teamMembers: 5,
    },
  },
  enterprise: {
    name: "Enterprise",
    price: 7999,
    durationDays: 30,
    limits: {
      messages: -1,
      aiQueries: -1,
      invoices: -1,
      teamMembers: -1,
    },
  },
};

const SubscriptionSchema = new mongoose.Schema({
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },

  plan:      { type: String, enum: Object.keys(PLANS), default: 'free_trial' },
  status:    { type: String, enum: ['active', 'expired', 'cancelled', 'trial'], default: 'trial' },

  trialStartDate: { type: Date, default: Date.now },
  trialEndDate:   { type: Date },

  currentPeriodStart: { type: Date },
  currentPeriodEnd:   { type: Date },

  // Razorpay / payment gateway fields (populated when real payment is made)
  razorpaySubscriptionId: { type: String, default: null },
  razorpayCustomerId:     { type: String, default: null },
  paymentMethod:          { type: String, default: null }, // last 4 digits etc.

  // Usage counters (reset each billing cycle)
  usage: {
    messages:    { type: Number, default: 0 },
    aiQueries:   { type: Number, default: 0 },
    invoices:    { type: Number, default: 0 },
    teamMembers: { type: Number, default: 1 },
  },

  // Billing history
  invoices: [{
    invoiceId:  String,
    amount:     Number,
    status:     String, // paid, failed
    date:       Date,
    downloadUrl:String,
  }],

}, { timestamps: true });

// Virtual: days remaining in trial
SubscriptionSchema.virtual('trialDaysRemaining').get(function () {
  if (this.status !== 'trial') return 0;
  const now = new Date();
  const diff = this.trialEndDate - now;
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
});

SubscriptionSchema.set('toJSON', { virtuals: true });

module.exports = { Subscription: mongoose.model('Subscription', SubscriptionSchema), PLANS };
