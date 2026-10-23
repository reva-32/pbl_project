const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');

// All message routes require authentication in a real scenario
// router.use(authMiddleware);

/**
 * Route to send a reply back to a customer via social messenger
 * POST /api/messages/reply
 */
router.post('/reply', messageController.sendReply);

module.exports = router;
