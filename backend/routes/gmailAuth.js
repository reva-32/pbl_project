const express = require('express');
const router = express.Router();
const gmailAuthController = require('../controllers/gmailAuthController');
const { authMiddleware } = require('../middleware/auth');

// GET /api/webhook/gmail/auth/url  — get OAuth URL
router.get('/url', authMiddleware, gmailAuthController.getAuthUrl);

// GET /api/webhook/gmail/auth/callback  — OAuth callback from Google
router.get('/callback', gmailAuthController.authCallback);

// GET /api/webhook/gmail/auth/status  — check connection + saved message count
router.get('/status', authMiddleware, gmailAuthController.gmailStatus);

// POST /api/webhook/gmail/auth/sync  — manually pull last N inbox emails
router.post('/sync', authMiddleware, gmailAuthController.manualSync);

// DELETE /api/webhook/gmail/auth  — disconnect Gmail for this tenant
router.delete('/', authMiddleware, gmailAuthController.disconnectGmail);

module.exports = router;
