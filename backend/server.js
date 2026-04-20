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
const webhookRoutes = require('./routes/webhook');
const messageRoutes = require('./routes/messages');


const app  = express();
const PORT = process.env.PORT || 5000;

// ── Ensure uploads & public/invoices dirs exist ───────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
const invoicesDir = path.join(__dirname, 'public', 'invoices');
[uploadsDir, invoicesDir].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Global Middleware ─────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:8080',
  process.env.FRONTEND_URL, // e.g., 'https://msme-360.vercel.app'
].filter(Boolean);

app.use(cors({ 
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin) || origin.includes('vercel.app')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true 
}));
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
app.use('/api/webhook',   webhookRoutes);   // Webhook (Meta)
app.use('/api/messages',  messageRoutes);   // Outgoing Replies


// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ 
  status: 'ok', 
  service: 'MSME-360 API', 
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development'
}));

// ── Production Frontend Serving ───────────────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const frontendDistPath = path.join(__dirname, '..', 'frontend', 'dist');
  
  // Serve static assets from the frontend build folder
  app.use(express.static(frontendDistPath));

  // Catch-all route: Send back index.html for any request that doesn't match an API route
  // This is required for React Router's client-side routing to work on page refresh.
  app.get('*', (req, res) => {
    // Skip API routes to avoid confusion
    if (req.path.startsWith('/api') || req.path.startsWith('/invoices')) return;
    res.sendFile(path.join(frontendDistPath, 'index.html'));
  });
} else {
  // Simple landing page for dev mode
  app.get('/', (_req, res) => res.send('MSME-360 API Server is running. Access endpoints via /api/...'));
}

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
