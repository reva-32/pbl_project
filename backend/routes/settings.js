const express = require('express');
const router = express.Router();
const User = require('../models/user');
const { authMiddleware } = require('../middleware/auth');

// Never return OAuth tokens or internal delivery bookkeeping to the browser.
const SAFE_USER_FIELDS = [
  '-password',
  '-googleAccessToken',
  '-googleRefreshToken',
  '-googleTokenExpiry',
  '-lastGmailHistoryId',
].join(' ');

// GET /api/settings — fetch all settings for logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(SAFE_USER_FIELDS);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/business — update business info
router.put('/business', authMiddleware, async (req, res) => {
  try {
    const { companyName, address, gstin, pan, businessType, city, whatsappPhoneNumberId } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { companyName, address, gstin, pan, businessType, city, whatsappPhoneNumberId },
      { new: true, select: SAFE_USER_FIELDS }
    );
    res.json({ message: 'Business info updated', user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/invoice — update invoice defaults
router.put('/invoice', authMiddleware, async (req, res) => {
  try {
    const { currency, invoicePrefix, paymentTerms, taxRate } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { currency, invoicePrefix, paymentTerms, taxRate },
      { new: true, select: SAFE_USER_FIELDS }
    );
    res.json({ message: 'Invoice settings updated', user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/localization — update language/timezone/dateFormat
router.put('/localization', authMiddleware, async (req, res) => {
  try {
    const { language, timezone, dateFormat } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { language, timezone, dateFormat },
      { new: true, select: SAFE_USER_FIELDS }
    );
    res.json({ message: 'Preferences saved', user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/account — update personal info
router.put('/account', authMiddleware, async (req, res) => {
  try {
    const { ownerName, email, phone } = req.body;
    if (email) {
      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email address' });
      }
      const duplicate = await User.findOne({ email: normalizedEmail, _id: { $ne: req.userId } });
      if (duplicate) {
        return res.status(409).json({ error: 'That email is already in use by another account' });
      }
    }

    const updates = { ownerName, phone };
    if (email) updates.email = String(email).trim().toLowerCase();

    const user = await User.findByIdAndUpdate(
      req.userId,
      updates,
      { new: true, select: SAFE_USER_FIELDS }
    );
    // Return updated user so frontend can refresh localStorage
    res.json({ message: 'Account updated', user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/notifications — save notification toggles
router.put('/notifications', authMiddleware, async (req, res) => {
  try {
    const { notifications } = req.body;
    const user = await User.findByIdAndUpdate(
      req.userId,
      { notifications },
      { new: true, select: SAFE_USER_FIELDS }
    );
    res.json({ message: 'Notification preferences saved', user });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/security — password change, 2FA, loginAlerts
router.put('/security', authMiddleware, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { currentPassword, newPassword, twoFactorEnabled, loginAlerts } = req.body;

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // If changing password
    if (newPassword && currentPassword) {
      if (String(newPassword).length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters' });
      }
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
      user.password = await bcrypt.hash(newPassword, 12);
    } else if (newPassword || currentPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }

    if (typeof twoFactorEnabled === 'boolean') user.twoFactorEnabled = twoFactorEnabled;
    if (typeof loginAlerts === 'boolean') user.loginAlerts = loginAlerts;

    await user.save();
    res.json({ message: 'Security settings updated' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
