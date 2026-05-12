const express = require('express');
const router = express.Router();
const gmailAuthController = require('../controllers/gmailAuthController');
const { authMiddleware } = require('../middleware/auth');

// GET /api/webhook/gmail/auth/url
router.get('/url', authMiddleware, gmailAuthController.getAuthUrl);

// GET /api/webhook/gmail/auth/callback
router.get('/callback', gmailAuthController.authCallback);

module.exports = router;
