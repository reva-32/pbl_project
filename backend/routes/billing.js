const express = require('express');
const router = express.Router();
const { Subscription, PLANS } = require('../models/Subscription');
const { authMiddleware } = require('../middleware/auth');

// ── GET /api/billing ──────────────────────────────────────────────────────
router.get('/', authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.userId });
    if (!sub) return res.status(404).json({ error: 'No subscription found' });

    // Check if trial has expired
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
        currentPeriodStart: sub.currentPeriodStart,
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
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/billing/status ───────────────────────────────────────────────
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

// ── POST /api/billing/activate-plan ───────────────────────────────────────
// Called after "payment" (for college prototype)
router.post('/activate-plan', authMiddleware, async (req, res) => {
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
    sub.paymentMethod = "Razorpay (Test Mode)";
    sub.usage = {
      messages:    0,
      aiQueries:   0,
      invoices:    0,
      teamMembers: 1,
    };

    await sub.save();

    res.json({
      message: `Upgraded to ${PLANS[planId].name}`,
      subscription: {
        plan:               sub.plan,
        planName:           PLANS[sub.plan].name,
        price:              PLANS[sub.plan].price,
        status:             sub.status,
        currentPeriodStart: sub.currentPeriodStart,
        currentPeriodEnd:   sub.currentPeriodEnd,
        paymentMethod:      sub.paymentMethod,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/billing/cancel ──────────────────────────────────────────────
router.post('/cancel', authMiddleware, async (req, res) => {
  try {
    const sub = await Subscription.findOne({ userId: req.userId });
    if (!sub) return res.status(404).json({ error: 'No subscription found' });

    sub.status = 'cancelled';
    sub.currentPeriodEnd = new Date(); // Cancel immediately
    await sub.save();

    res.json({
      message: 'Subscription cancelled',
      subscription: {
        plan:   sub.plan,
        status: sub.status,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
