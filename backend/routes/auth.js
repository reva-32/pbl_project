const express    = require('express');
const router     = express.Router();
const { signup, login } = require('../controllers/authController');
const { createRateLimiter } = require('../middleware/rateLimit');

// Slow down credential stuffing without adding a dependency.
const authLimiter = createRateLimiter({
  windowMs: 15 * 60_000,
  max: 30,
  keyGenerator: (req) => `auth:${req.ip}`,
  message: 'Too many sign-in attempts. Please wait a few minutes.',
});

// POST /api/signup
router.post('/signup', authLimiter, signup);

// POST /api/login
router.post('/login', authLimiter, login);

module.exports = router;
