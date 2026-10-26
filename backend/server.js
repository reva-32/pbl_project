require('dotenv').config();
console.log('🚀 SYSTEM BOOT: Starting MSME-360 API Server...');

// ── Emergency Error Catching (Prevent silent crashes) ────────────────────────
process.on('uncaughtException', (err) => {
  console.error('🔥 UNCAUGHT EXCEPTION:', err.message);
  console.error(err.stack);
  // In production, we don't want to exit(1) immediately for every error
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🔥 UNHANDLED REJECTION at:', promise, 'reason:', reason);
});

const requiredEnv = ['MONGO_URI', 'JWT_SECRET'];
requiredEnv.forEach(key => {
  if (!process.env[key]) {
    console.error(`❌ FATAL ERROR: Missing environment variable: ${key}`);
    process.exit(1);
  }
});

// AI classification degrades gracefully without a key; do not block the API.
if (!process.env.GROQ_API_KEY) {
  console.warn('⚠️  GROQ_API_KEY is not set — AI summaries will use the safe fallback.');
}

const express   = require('express');
console.log('✅ Express loaded');
const cors      = require('cors');
const mongoose  = require('mongoose');
console.log('✅ Base libraries loaded');
const path      = require('path');
const fs        = require('fs');

// ── Route imports ─────────────────────────────────────────────────────────────
console.log('📦 Loading routes...');
const authRoutes    = require('./routes/auth');
console.log('   - Auth routes ready');
const billingRoutes = require('./routes/billing');
console.log('   - Billing routes ready');
const settingsRoutes= require('./routes/settings');
console.log('   - Settings routes ready');
const ingestRoutes  = require('./routes/ingest');
console.log('   - Ingest routes ready');
const searchRoutes  = require('./routes/search');
console.log('   - Search routes ready');
const entitiesRoutes= require('./routes/entities');
console.log('   - Entities routes ready');
const webhookRoutes = require('./routes/webhook');
console.log('   - Webhook routes ready');
const messageRoutes = require('./routes/messages');
console.log('   - Message routes ready');
const integrationRoutes = require('./routes/integrations');
console.log('   - Integration routes ready');


const app  = express();
const PORT = process.env.PORT || 5001;

// ── Ensure uploads & public/invoices dirs exist ───────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
const invoicesDir = path.join(__dirname, 'public', 'invoices');
[uploadsDir, invoicesDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Global Middleware ─────────────────────────────────────────────────────────
// Exact origins only. A wildcard on *.vercel.app / *.onrender.com would let
// any unrelated deployment read authenticated API responses.
const envConfig = require('./config/env');
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:8080',
  process.env.FRONTEND_URL,
  envConfig.frontendUrl,
  ...envConfig.extraOrigins.split(',').map((origin) => origin.trim()),
].filter(Boolean));

app.use(cors({
  origin: (origin, callback) => {
    // Same-origin requests and server-to-server calls have no Origin header.
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      console.warn(`🚫 CORS Blocked Origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
// Keep the raw request body so webhook handlers can verify provider signatures.
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf; },
}));
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
app.use('/api/webhook',   webhookRoutes);   // Webhook (Meta)
app.use('/api/messages',  messageRoutes);   // Outgoing Replies
app.use('/api/integrations', integrationRoutes); // Channel connections (OAuth/manual)


// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ 
  status: 'ok', 
  service: 'MSME-360 API', 
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development'
}));

// ── Production Frontend Serving ───────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  // Try several potential paths for the dist folder
  const possiblePaths = [
    path.join(__dirname, '..', 'frontend', 'dist'), // Relative to backend/server.js
    path.join(process.cwd(), 'frontend', 'dist'),   // Relative to CWD
    path.join(process.cwd(), 'dist'),             // Root dist
  ];

  let frontendDistPath = possiblePaths[0]; // Default
  
  console.log('🔍 Searching for frontend/dist...');
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      frontendDistPath = p;
      console.log(`✅ FOUND frontend/dist at: ${p}`);
      break;
    } else {
      console.log(`❌ Not found at: ${p}`);
    }
  }
  
  if (!fs.existsSync(frontendDistPath)) {
    console.error('⚠️ CRITICAL: Could not find any frontend/dist folder.');
    console.log(`📁 Current Directory: ${process.cwd()}`);
    try {
      console.log(`📁 Root Contents: ${fs.readdirSync(process.cwd()).join(', ')}`);
    } catch (e) {}
  } else {
    const files = fs.readdirSync(frontendDistPath);
    console.log(`📝 Files in dist: ${files.join(', ')}`);
  }

  app.use(express.static(frontendDistPath));

  app.get('*', (req, res) => {
    if (!req.path.includes('.') || req.path.startsWith('/dashboard') || req.path === '/') {
      const indexPath = path.join(frontendDistPath, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send(`index.html not found in dist. Search path: ${indexPath}`);
      }
    } else {
      res.status(404).send('Asset not found');
    }
  });
}
 else {
  // Simple landing page for dev mode
  app.get('/', (_req, res) => res.send('MSME-360 API Server is running. Access endpoints via /api/...'));
}

// ── Server Start ──────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 MSME-360 API running → http://0.0.0.0:${PORT}`);
  
  // ── MongoDB Connection (Connect after port is open) ──────────────────────────
  console.log('📡 Connecting to MongoDB Atlas...');
  mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
      console.log('✅ MongoDB connected successfully');
    })
    .catch((err) => {
      console.error('❌ MongoDB connection failed:', err.message);
      // We don't exit immediately so we can see the full error in the logs
    });
});
