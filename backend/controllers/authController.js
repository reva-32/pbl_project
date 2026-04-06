const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const User      = require('../models/User');
const { Subscription } = require('../models/Subscription');
const { createCompanySheet } = require('../services/sheets.service');

// ── POST /api/signup ──────────────────────────────────────────────────────────
exports.signup = async (req, res) => {
  try {
    const { email, password, companyName, ownerName, phone, businessType, city, gstin } = req.body;

    // Validate required fields
    if (!email || !password || !companyName || !ownerName || !phone) {
      return res.status(400).json({ error: 'Email, password, company name, owner name, and phone are required.' });
    }

    // Check for duplicate email
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create Google Sheet for the company (non-blocking — don't fail signup if Sheets is down)
    let googleSheetId = null;
    try {
      googleSheetId = await createCompanySheet(companyName);
      console.log(`📊 Google Sheet created: ${googleSheetId}`);
    } catch (sheetErr) {
      console.warn('⚠️  Google Sheets skipped (check credentials):', sheetErr.message);
    }

    // Create user
    const user = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      companyName,
      ownerName,
      phone,
      businessType: businessType || '',
      city: city || '',
      gstin: gstin || '',
      googleSheetId,
    });

    // Create free-trial subscription immediately after user creation
    const trialEndDate = new Date();
    trialEndDate.setDate(trialEndDate.getDate() + 14); // 14-day trial

    await Subscription.create({
      userId: user._id,
      plan: 'free_trial',
      status: 'trial',
      trialStartDate: new Date(),
      trialEndDate,
    });

    console.log(`✅ New user registered: ${email}`);
    res.status(201).json({ message: 'Account created successfully. Please sign in.' });

  } catch (err) {
    console.error('❌ Signup error:', err);
    res.status(500).json({ error: 'Server error during signup.' });
  }
};

// ── POST /api/login ───────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    // Issue JWT (7-day expiry)
    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Return safe user profile (no password)
    const userProfile = {
      _id:          user._id,
      email:        user.email,
      companyName:  user.companyName,
      ownerName:    user.ownerName,
      phone:        user.phone,
      businessType: user.businessType,
      city:         user.city,
      gstin:        user.gstin,
      googleSheetId:user.googleSheetId,
    };

    console.log(`✅ Login: ${email}`);
    res.json({ token, user: userProfile });

  } catch (err) {
    console.error('❌ Login error:', err);
    res.status(500).json({ error: 'Server error during login.' });
  }
};
