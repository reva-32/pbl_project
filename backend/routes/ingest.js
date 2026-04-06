const express          = require('express');
const router           = express.Router();
const multer           = require('multer');
const path             = require('path');
const { authMiddleware } = require('../middleware/auth');
const ingestController = require('../controllers/ingestController');
const { processImage } = require('../controllers/ocrController');

// ── Multer config for OCR file uploads ───────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.join(__dirname, '../uploads')),
  filename:    (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type not supported. Allowed: ${allowed.join(', ')}`));
    }
  },
});

// POST /api/ingest          — ingest raw text into vector store (authenticated)
router.post('/', authMiddleware, ingestController.ingestData);

// POST /api/ingest/ocr      — upload image/PDF → OCR → auto-ingest (authenticated)
router.post('/ocr', authMiddleware, upload.single('file'), processImage);

module.exports = router;