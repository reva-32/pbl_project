# MSME-360 — Technical Implementation & Architecture

---

## 1. Multi-Tenancy Architecture & Updated MongoDB Schemas

Every data entity is strictly bound to a `userId`. The system enforces a hard multi-tenant boundary, ensuring that an MSME owner can never access or query another MSME's data. 

**`User` Schema**
- `_id` (ObjectId)
- `email`, `password` (String, Hash)
- `companyName`, `ownerName`, `phone` (String)
- `googleSheetId` (String) - Unique to this user, provisioned at signup.
- `settings` (Object) - e.g., timezone, currency

**`Subscription` Schema**
- `userId` (ObjectId, ref: User)
- `plan` (Enum: free_trial, starter, professional, enterprise)
- `status` (Enum: active, expired, cancelled)

**`Vendor` Schema** [NEW]
- `userId` (ObjectId, ref: User) *← Tenancy Key*
- `name`, `email`, `phone` (String)
- `reliabilityScore` (Number)
- `avgDeliveryDays` (Number)

**`Customer` Schema** [NEW]
- `userId` (ObjectId, ref: User) *← Tenancy Key*
- `name`, `phone`, `address` (String)
- `preferredChannel` (String)

**`Inventory` Schema** [NEW]
- `userId` (ObjectId, ref: User) *← Tenancy Key*
- `name`, `sku` (String)
- `price`, `stockLevel` (Number)
- `vendorId` (ObjectId, ref: Vendor)

**`DecisionEvent` Schema** (Updated for RAG)
- `userId` (ObjectId, ref: User) *← Tenancy Key*
- `type` (Enum: INVOICE, RECEIPT, SCANNED_DOC, etc.)
- `content` (Object)
- `embedding` (Array of Numbers, 384-dim)
- `status` (String)

---

## 2. Dual-Sync Persistence Flow (MongoDB ↔ Google Sheets)

Every mutating operation (Add/Update) flows through a dual-sync pipeline to ensure data availability in both rapid-access (Mongo) and user-readable (Sheets) locations.

**Execution Flow (e.g., adding a Vendor):**
1. **Frontend**: POST `/api/vendors` with Authorization Bearer token.
2. **Middleware**: `auth.js` verifies JWT, attaches `req.userId` to the request.
3. **Controller**: Validates payload and executes `Vendor.create({ ...payload, userId: req.userId })`.
4. **Service (Async Dual-Sync)**: 
   - Retrieves `googleSheetId` from the `req.user` or DB lookup.
   - Calls `sheets.service.js -> appendRow(googleSheetId, 'Vendors', rowData)`.
5. **Controller**: Returns 201 Created to the frontend immediately (does not block on the Sheets API to ensure fast UI response).

---

## 3. RAG Pipeline & AI Architecture

The RAG (Retrieval-Augmented Generation) pipeline gives the AI access to the business's own historical data. It uses the `userId` to strictly filter context before generating a response with the Groq API.

```
User Query
    │
    ▼
┌─────────────────────────────────┐
│  getEmbedding(query)            │  ← services/ragService.js
│  Xenova/all-MiniLM-L6-v2       │
│  Output: 384-dim float32 vector │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│  MongoDB Atlas $vectorSearch    │  ← DecisionEvent collection
│  index: "vector_index"          │
│  MUST filter by: userId         │  <--- Tenancy isolation
└─────────────────────────────────┘
    │
    ▼
  Top-3 matching private records
    │
    ▼
┌─────────────────────────────────┐
│  Groq API (llama-3.3-70b)      │
│  Context + Query Injection      │
└─────────────────────────────────┘
    │
    ▼
  AI Response
```

---

## 4. OCR to Automation Flow

**Execution Flow (`/api/ingest/ocr`)**:
1. User uploads an image via the Chat/OCR component.
2. `ocrController.js` and `Tesseract.js` process the image to extract raw text (if PDF, poppler converts to PNG first).
3. The extracted text is categorised by the LLM with a strict JSON schema (Invoice, Contract, Receipt).
4. Text is embedded via `@xenova` and stored as a `DecisionEvent` under the user's `userId`.
5. Based on the JSON schema, suggest standard entries (Inventory/Vendor) back to the user for explicit approval.

---

## 5. Authentication Flow

```
Protected Route ────────────────────────────────────────────────────
  Client sends: Authorization: Bearer <token>
    → authMiddleware extracts token
    → jwt.verify(token, JWT_SECRET)
    → sets req.userId, req.userEmail
    → calls next()
```
