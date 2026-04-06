require('dotenv').config();
const express   = require('express');
const cors      = require('cors');
const mongoose  = require('mongoose');
const path      = require('path');
const fs        = require('fs');

// ── Route imports ─────────────────────────────────────────────────────────────
const authRoutes    = require('./routes/auth');
const billingRoutes = require('./routes/billing');
const settingsRoutes= require('./routes/settings');
const ingestRoutes  = require('./routes/ingest');
const searchRoutes  = require('./routes/search');
const entitiesRoutes= require('./routes/entities');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Ensure uploads & public/invoices dirs exist ───────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
const invoicesDir = path.join(__dirname, 'public', 'invoices');
[uploadsDir, invoicesDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:8080'], credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve static invoices (PDF downloads) ────────────────────────────────────
app.use('/invoices', express.static(path.join(__dirname, 'public', 'invoices')));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api',           authRoutes);      // POST /api/signup, POST /api/login
app.use('/api/billing',   billingRoutes);   // GET/POST /api/billing/...
app.use('/api/settings',  settingsRoutes);  // GET/PUT  /api/settings/...
app.use('/api/ingest',    ingestRoutes);    // POST /api/ingest, POST /api/ingest/ocr
app.use('/api/search',    searchRoutes);    // POST /api/search
app.use('/api',           entitiesRoutes);  // GET/POST /api/vendors, /customers, /inventory

// ── Health check & Root ────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.send('MSME-360 API Server is running. Access endpoints via /api/...'));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'MSME-360 API' }));

// ── MongoDB Connection ────────────────────────────────────────────────────────
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, () => console.log(`🚀 MSME-360 API running → http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
