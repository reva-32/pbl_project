const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const multer = require('multer');
const upload = multer();
const gmailAuthRoutes = require('./gmailAuth');

// Mount Gmail OAuth routes
router.use('/gmail/auth', gmailAuthRoutes);

/**
 * Meta Webhook Endpoints (WhatsApp, Instagram, Messenger)
 */

// GET Verification (called by Meta once to setup the webhook)
router.get('/meta', webhookController.verifyWebhook);

// POST Notification (called by Meta whenever a new message arrives)
router.post('/meta', webhookController.receiveNotification);

/**
 * Email Webhook Endpoint (SendGrid / Mailgun)
 */
router.post('/email', upload.any(), webhookController.receiveEmail);

/**
 * Gmail Webhook Endpoint (Pub/Sub Push)
 */
router.post('/gmail', webhookController.receiveGmailWebhook);

module.exports = router;
