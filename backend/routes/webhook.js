const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

/**
 * Meta Webhook Endpoints (WhatsApp, Instagram, Messenger)
 */

// GET Verification (called by Meta once to setup the webhook)
router.get('/meta', webhookController.verifyWebhook);

// POST Notification (called by Meta whenever a new message arrives)
router.post('/meta', webhookController.receiveNotification);

module.exports = router;
