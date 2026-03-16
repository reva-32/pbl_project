const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());

// ── DB Connection ──────────────────────────────────────────────────────────
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log(err));

// ── Models ─────────────────────────────────────────────────────────────────
const User = require('./models/User');
const { Subscription, PLANS } = require('./models/Subscription');

// ── SIGNUP ─────────────────────────────────────────────────────────────────
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, companyName, ownerName, phone, businessType, city, gstin } = req.body;

    if (!email || !password || !companyName || !ownerName || !phone) {
      return res.status(400).json({ error: "Please fill in all required fields." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ email, password: hashedPassword, companyName, ownerName, phone, businessType, city, gstin });
    await newUser.save();

    // ── AUTO-CREATE 14-day free trial subscription on signup ──
    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + 14);

    await new Subscription({
      userId:         newUser._id,
      plan:           'free_trial',
      status:         'trial',
      trialStartDate: now,
      trialEndDate:   trialEnd,
    }).save();

    res.status(201).json({ message: "Registration successful! Your 14-day free trial has started." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

// ── LOGIN ──────────────────────────────────────────────────────────────────
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Fetch subscription status
    const sub = await Subscription.findOne({ userId: user._id });
    let subscriptionStatus = null;
    let trialDaysRemaining = 0;

    if (sub) {
      // Auto-expire trial
      if (sub.status === 'trial' && new Date() > sub.trialEndDate) {
        sub.status = 'expired';
        await sub.save();
      }
      subscriptionStatus = sub.status;
      trialDaysRemaining = sub.trialDaysRemaining;
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, companyName: user.companyName, ownerName: user.ownerName },
      process.env.JWT_SECRET || 'YOUR_SECRET_KEY',
      { expiresIn: '8h' }
    );

    res.json({
      token,
      user: {
        email:        user.email,
        companyName:  user.companyName,
        ownerName:    user.ownerName,
        phone:        user.phone,
        businessType: user.businessType,
        city:         user.city,
        gstin:        user.gstin,
      },
      subscription: {
        plan:               sub?.plan ?? 'free_trial',
        status:             subscriptionStatus ?? 'trial',
        trialDaysRemaining: trialDaysRemaining,
        // canAccess = trial active OR paid plan active
        canAccess: subscriptionStatus === 'trial' || subscriptionStatus === 'active',
      },
      message: "Login successful",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// ── Route files ────────────────────────────────────────────────────────────
app.use('/api/settings', require('./routes/settings'));
app.use('/api/billing',  require('./routes/billing'));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
