const express = require('express');
const router = express.Router();
const { Subscription, PLANS } = require('../models/Subscription');
const { authMiddleware } = require('../middleware/auth');

// GET /api/billing — get subscription info for logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.userId });
    if (!sub) return res.status(404).json({ error: 'No subscription found' });

    // Check if trial has expired — auto-update status
    if (sub.status === 'trial' && new Date() > sub.trialEndDate) {
      sub.status = 'expired';
      await sub.save();
    }

    res.json({
      subscription: {
        plan:               sub.plan,
        planName:           PLANS[sub.plan].name,
        price:              PLANS[sub.plan].price,
        status:             sub.status,
        trialDaysRemaining: sub.trialDaysRemaining,
        trialEndDate:       sub.trialEndDate,
        currentPeriodEnd:   sub.currentPeriodEnd,
        usage:              sub.usage,
        limits:             PLANS[sub.plan].limits,
        paymentMethod:      sub.paymentMethod,
        invoices:           sub.invoices,
      },
      allPlans: Object.entries(PLANS).map(([key, val]) => ({
        id: key, ...val,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/billing/status — lightweight check (used by middleware)
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.userId });
    if (!sub) return res.json({ canAccess: false, reason: 'no_subscription' });

    if (sub.status === 'trial' && new Date() > sub.trialEndDate) {
      sub.status = 'expired';
      await sub.save();
      return res.json({ canAccess: false, reason: 'trial_expired' });
    }

    if (sub.status === 'expired' || sub.status === 'cancelled') {
      return res.json({ canAccess: false, reason: sub.status });
    }

    return res.json({
      canAccess: true,
      plan: sub.plan,
      status: sub.status,
      trialDaysRemaining: sub.trialDaysRemaining,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/billing/select-plan — called when user picks a plan
// In real life this would create a Razorpay order/subscription
// For now it simulates upgrading
router.post('/select-plan', authMiddleware, async (req, res) => {
  try {
    const { planId } = req.body;
    if (!PLANS[planId]) return res.status(400).json({ error: 'Invalid plan' });
    if (planId === 'free_trial') return res.status(400).json({ error: 'Cannot select free trial' });

    const sub = await Subscription.findOne({ userId: req.userId });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setDate(periodEnd.getDate() + PLANS[planId].durationDays);

    sub.plan   = planId;
    sub.status = 'active';
    sub.currentPeriodStart = now;
    sub.currentPeriodEnd   = periodEnd;

    // In real life: create Razorpay subscription here and save razorpaySubscriptionId
    // const razorpayOrder = await razorpay.subscriptions.create({ ... });
    // sub.razorpaySubscriptionId = razorpayOrder.id;

    await sub.save();
    res.json({ message: `Upgraded to ${PLANS[planId].name}`, subscription: sub });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/billing/cancel — cancel subscription
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.userId });
    if (!sub) return res.status(404).json({ error: 'No subscription found' });
    sub.status = 'cancelled';
    await sub.save();
    res.json({ message: 'Subscription cancelled' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
