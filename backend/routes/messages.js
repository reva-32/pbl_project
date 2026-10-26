const express = require('express');
const router = express.Router();
const messageController = require('../controllers/messageController');
const { authMiddleware } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const replyLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 30,
  keyGenerator: (req) => `reply:${req.userId || req.ip}`,
  message: 'Too many replies. Please wait a minute and try again.',
});

router.use(authMiddleware);

router.get('/conversations', messageController.conversations);
router.post('/reply', replyLimiter, messageController.sendReply);

module.exports = router;
