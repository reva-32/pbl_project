const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const controller = require('../controllers/integrationController');
const { createRateLimiter } = require('../middleware/rateLimit');

const statusLimiter = createRateLimiter({
  windowMs: 60_000,
  max: 120,
  keyGenerator: (req) => `status:${req.userId || req.ip}`,
});

router.get('/status', authMiddleware, statusLimiter, controller.status);

// Meta (Facebook Page + Instagram professional account) OAuth
router.get('/meta/connect', authMiddleware, controller.metaConnect);
router.get('/meta/callback', controller.metaCallback);

// WhatsApp Cloud API manual credential connection
router.post('/whatsapp', authMiddleware, controller.connectWhatsApp);

// Disconnect a Meta/WhatsApp account owned by the calling tenant
router.delete('/:provider/:id', authMiddleware, controller.disconnect);

module.exports = router;
