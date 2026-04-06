const express          = require('express');
const router           = express.Router();
const multer           = require('multer');
const path             = require('path');
const { authMiddleware } = require('../middleware/auth');
const searchController = require('../controllers/searchController');

// ── Multer config for optional signature file on invoice generation ───────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (_req, file, cb) => cb(null, `sig-${Date.now()}${path.extname(file.originalname)}`),
});

const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// POST /api/search — RAG search + LLM response (authenticated)
// Accepts multipart/form-data so a signature image can be optionally attached
router.post('/', authMiddleware, upload.single('signature'), searchController.searchEvents);

module.exports = router;