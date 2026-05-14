# MSME-360 — Unified Enterprise Platform

> **AI-powered Business Automation, Multi-Tenant Database, & Google Sheets Sync Engine**

---

## What is MSME-360?

MSME-360 is an enterprise SaaS platform that gives small business owners a unified command centre for:

- **AI Command Center (RAG Pipeline)** — Business assistant powered by Groq API that retrieves private context from user records, processes OCR invoices, and provides contextual answers.
- **Strict Multi-Tenancy** — Every business has completely isolated Vendors, Customers, Inventory, and RAG contexts mapped to their `userId`.
- **Dual-Sync Persistence** — Adding a vendor or scanning a receipt seamlessly updates both the MongoDB database (for fast real-time access) and a user-specific Google Spreadsheet.

---

## Deployment Strategy

The application is deployed across managed cloud platforms:
- **Frontend**: React application hosted on **Render** for high-performance delivery.
- **Backend**: Node.js/Express API hosted on **Render** both for seamless integration.
- **Database**: **MongoDB Atlas** provides a fully managed cloud database with automated backups and scaling.

---

## Setup & Environment

### 1. Configure the Environment
```bash
cd backend
cp .env.template .env
```
Ensure your `.env` is fully populated with:
- `MONGO_URI`
- `JWT_SECRET`
- `GROQ_API_KEY`
- `GOOGLE_CLIENT_EMAIL` & `GOOGLE_PRIVATE_KEY` (from Google Service Account JSON)

### 2. Install Dependencies
```bash
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

> **Note:** The backend will download an ~80MB embedding model the first time it starts.

### 3. Set up MongoDB Atlas Vector Search
You must create an Atlas Search Index named exactly **`vector_index`** on the `decision_events` collection:
```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "dimensions": 384,
        "similarity": "cosine",
        "type": "knnVector"
      }
    }
  }
}
```

### 4. Run the Dev Servers
```bash
# Terminal 1 — Backend
cd backend
npm run dev

# Terminal 2 — Frontend
cd frontend
npm run dev
```

---

## Core Technologies
- **Frontend**: React 18, Vite, TypeScript, Shadcn/UI, Tailwind CSS
- **Backend**: Node.js, Express, Mongoose, JWT Wait-Free Auth
- **AI/ML**: Groq API, `@xenova/transformers` (local embeddings), Tesseract.js (OCR)
- **External**: Google Sheets API
