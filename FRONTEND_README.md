# 🎨 AI Bookkeeping Frontend - Complete Integration Guide

## 📋 Overview

A modern Next.js frontend that's **fully integrated** with the Python FastAPI backend for AI-powered bookkeeping.

## 🏗️ Architecture

```
Frontend (Next.js/React)
    ↓
API Client (src/lib/api.ts)
    ↓
Python Backend (FastAPI on port 8000)
    ↓
Supabase (PostgreSQL + Storage + pgvector)
```

## 📁 New Frontend Structure

```
src/
├── lib/
│   ├── api.ts              # FastAPI client (all backend calls)
│   └── supabase.ts         # Supabase client (storage + auth)
│
├── app/
│   ├── page-new.tsx        # New homepage with full navigation
│   ├── upload/             # Upload flow with Golden Equation
│   │   ├── page.tsx
│   │   └── upload.module.css
│   ├── review/[statementId]/ # THE LEARNING LOOP
│   │   ├── page.tsx
│   │   └── review.module.css
│   └── analytics/          # AI performance metrics
│       ├── page.tsx
│       └── analytics.module.css
```

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

**New dependency added:** `@supabase/supabase-js`

### 2. Configure Environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
# Supabase (for storage and auth)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Python Backend API
NEXT_PUBLIC_API_URL=http://localhost:8000

# App URL
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### 3. Start Development Server

```bash
# Terminal 1: Python Backend
cd python-backend
uvicorn app.main:app --reload --port 8000

# Terminal 2: Next.js Frontend
npm run dev
```

Frontend: http://localhost:3000
Backend API: http://localhost:8000
Backend Docs: http://localhost:8000/docs

---

## 🔄 User Workflows

### 1️⃣ Upload & Process Statement

**Page:** `/upload`

**Flow:**
1. User drags/drops or selects PDF/CSV file
2. File uploads to Supabase Storage (`financial-docs` bucket)
3. Frontend calls: `POST /api/statement/{id}/process-and-categorize`
4. Backend performs **Golden Equation check**:
   ```
   Opening Balance + Σ(Transactions) = Closing Balance
   ```
5. If ✅ **PASS**: Transactions inserted, AI categorizes
6. If ❌ **FAIL**: Show error, NO data inserted
7. Redirect to review page

**Key Files:**
- `src/app/upload/page.tsx`
- `src/lib/supabase.ts` - `uploadBankStatement()`
- `src/lib/api.ts` - `processAndCategorize()`

---

### 2️⃣ Review & Learn (THE LEARNING LOOP)

**Page:** `/review/[statementId]`

**Flow:**
1. Loads transactions: `GET /api/statement/{id}/review`
2. Transactions sorted by priority:
   - **Priority 1:** Low confidence (< 90%) - shown first
   - **Priority 2:** High confidence
3. User either:
   - **Approves** AI suggestion → Calls `POST /api/transaction/update`
   - **Corrects** category → Calls `POST /api/transaction/update`
4. **THE LEARNING TRIGGER:**
   ```typescript
   // Backend generates embedding and stores in learned_patterns
   // Next similar transaction → Vector search finds it!
   ```
5. Progress bar updates
6. When all verified → Enable "Sync to Xero" button

**Confidence Color Coding:**
- 🟢 Green (90%+): High confidence
- 🟠 Orange (70-89%): Medium confidence
- 🔴 Red (< 70%): Low confidence - NEEDS ATTENTION

**Key Files:**
- `src/app/review/[statementId]/page.tsx`
- `src/lib/api.ts` - `getReviewFeed()`, `updateTransaction()`

**Pattern Learning:**
```typescript
// First time: "Starbucks"
AI: "429: General Expenses" (confidence: 65%)
User corrects to: "420: Entertainment"
→ Embedding stored in vector DB

// Second time: "Starbucks"
Vector search: 97% similarity match!
AI: "420: Entertainment" (confidence: 99%) ✅
```

---

### 3️⃣ Sync to Xero

**Triggered from:** Review page "Sync to Xero" button

**Flow:**
1. Pre-condition check: All transactions `is_user_verified = True`?
2. If NO → Error: "Please review all transactions first"
3. If YES → `POST /api/statement/{id}/sync`
4. Backend:
   - Formats transactions for Xero API
   - Pushes with exponential backoff (rate limiting)
   - Updates `synced_to_xero` status
5. Success → Redirect to dashboard

**Safety Gate Example:**
```typescript
// 10 transactions, only 5 verified
syncToXero() → ❌ Error: "5 transaction(s) still need review"

// All 10 verified
syncToXero() → ✅ Success: "Synced 10 transactions to Xero"
```

---

### 4️⃣ Analytics Dashboard

**Page:** `/analytics`

**Flow:**
1. Loads metrics from backend:
   - `GET /api/analytics/correction-rate?days=30`
   - `GET /api/analytics/overconfidence`
   - `GET /api/analytics/learning-effectiveness`
2. Displays:
   - **Correction Rate** - How often AI is wrong (should decrease)
   - **Learning Effectiveness** - Vector match rate (should increase)
   - **Overconfidence Analysis** - Cases where AI was confident but wrong

**Time Range Selector:** 7, 30, or 90 days

**Key Metrics:**
- **Correction Rate < 15%:** ✅ Excellent
- **Correction Rate 15-30%:** ⚠️ Good
- **Correction Rate > 30%:** ❌ Needs more training

- **Vector Match Rate > 70%:** ✅ AI is learning well
- **Vector Match Rate < 30%:** ❌ Not enough patterns yet

---

## 🔌 API Integration Reference

All backend calls are in `src/lib/api.ts`:

| Function | Endpoint | Purpose |
|----------|----------|---------|
| `processStatement()` | `POST /api/process-statement` | Golden Equation check |
| `categorizeStatement()` | `POST /api/categorize-statement/{id}` | AI categorization |
| `processAndCategorize()` | `POST /api/statement/{id}/process-and-categorize` | Combined flow |
| `getReviewFeed()` | `GET /api/statement/{id}/review` | Get prioritized transactions |
| `updateTransaction()` | `POST /api/transaction/update` | **THE LEARNING TRIGGER** |
| `connectToXero()` | `GET /api/xero/connect` | OAuth redirect |
| `syncToXero()` | `POST /api/statement/{id}/sync` | Sync to ledger |
| `getCorrectionRate()` | `GET /api/analytics/correction-rate` | AI accuracy metric |
| `getOverconfidenceAnalysis()` | `GET /api/analytics/overconfidence` | Problem categories |
| `getLearningEffectiveness()` | `GET /api/analytics/learning-effectiveness` | Vector match trends |

---

## 🎨 UI Components

### Modern Design System

**Colors:**
- Primary: `#667eea` → `#764ba2` (gradient)
- Success: `#10b981` (green)
- Warning: `#f59e0b` (orange)
- Error: `#ef4444` (red)

**Typography:**
- Headings: Bold, 2-4rem
- Body: 1rem, line-height 1.6
- Monospace: Code/account codes

**Shadows:**
- Cards: `0 10px 30px rgba(0, 0, 0, 0.2)`
- Hover: `0 15px 40px rgba(102, 126, 234, 0.3)`

**Animations:**
- Hover: `transform: translateY(-4px)`
- Transitions: `all 0.3s ease`
- Loading: Spinning gradient bars

---

## 🔐 Security Features

### Supabase Storage RLS

Files are organization-scoped:
```typescript
// Upload path format
`{organization_id}/{year}/{month}/{statement_id}_{filename}`

// Only accessible by users in that organization
```

### API Authentication

Currently using mock organization ID:
```typescript
const MOCK_ORG_ID = '550e8400-e29b-41d4-a716-446655440000'
```

**Production TODO:**
- Implement Supabase Auth
- Get org_id from user session
- Pass JWT tokens to backend

---

## 📊 State Management

Using React hooks (no Redux needed):

**Upload Page:**
- `file` - Selected file
- `uploading` - Upload in progress
- `processing` - Backend processing
- `error` - Error message
- `progress` - Status message

**Review Page:**
- `transactions` - List from backend
- `verifiedCount` - Completed transactions
- `totalCount` - Total transactions
- `syncing` - Xero sync in progress

**Analytics Page:**
- `correctionData` - Correction rate metrics
- `overconfidenceData` - Problem cases
- `learningData` - Vector match trends
- `days` - Time range (7/30/90)

---

## 🧪 Testing the Integration

### 1. Test Upload Flow

```bash
# Start both servers
cd python-backend && uvicorn app.main:app --reload &
npm run dev

# 1. Go to http://localhost:3000/upload
# 2. Upload test_transactions.csv
# 3. Should process and redirect to review
```

### 2. Test Golden Equation

Create test CSV with WRONG math:
```csv
Opening Balance: $1000
Closing Balance: $1500  (WRONG - should be $1200)
Transactions: +$500, -$300
```

Expected: Error message showing discrepancy

### 3. Test Learning Loop

```bash
# 1. Review transactions
# 2. Correct "Starbucks" → "Entertainment"
# 3. Check backend logs: "AI learned new pattern"
# 4. Upload another statement with "Starbucks"
# 5. Should now suggest "Entertainment" with 99% confidence
```

### 4. Test Analytics

```bash
# 1. Review several statements (approve/correct)
# 2. Go to /analytics
# 3. Should see correction rate
# 4. Should see overconfidence cases
# 5. Should see vector match trend
```

---

## 🐛 Troubleshooting

### Backend Not Responding

```bash
# Check backend is running
curl http://localhost:8000/health

# Expected: {"status": "healthy"}
```

### CORS Errors

Backend has CORS enabled:
```python
allow_origins=["*"]  # In production, specify your domain
```

### File Upload Fails

Check Supabase Storage:
1. Bucket `financial-docs` exists?
2. RLS policies configured?
3. File size < 50MB?
4. Valid MIME type (PDF/CSV)?

### Review Page Empty

Check:
1. Statement processed successfully?
2. Organization ID matches?
3. Backend logs for errors?

---

## 🚀 Deployment

### Frontend (Vercel)

```bash
# Build
npm run build

# Environment variables needed:
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_API_URL=https://your-backend.com
```

### Backend (see python-backend/README.md)

Update `NEXT_PUBLIC_API_URL` to production backend URL.

---

## 📈 Performance Optimizations

- ✅ React components use `'use client'` for interactivity
- ✅ API calls are async with proper error handling
- ✅ File uploads show progress indicators
- ✅ CSS modules for scoped styling (no conflicts)
- ✅ Responsive design (mobile-friendly)

---

## 🎯 Key Features Implemented

1. ✅ **Upload Flow** - Drag/drop, Supabase Storage, Golden Equation
2. ✅ **Review Interface** - Prioritized transactions, confidence scores
3. ✅ **Learning Loop** - User corrections trigger vector storage
4. ✅ **Xero Integration** - OAuth redirect, sync with safety gate
5. ✅ **Analytics Dashboard** - Correction rate, overconfidence, learning trends
6. ✅ **Modern UI** - Gradient design, smooth animations, responsive

---

## 📚 Additional Resources

- **Backend API Docs:** http://localhost:8000/docs (Swagger)
- **Backend README:** `python-backend/README.md`
- **Architecture Review:** `ARCHITECTURE_REVIEW.md`
- **Build Summary:** `BUILD_COMPLETE_SUMMARY.md`

---

## 🎉 You're Ready!

The frontend is **fully integrated** with the Python backend. All workflows are connected:

- Upload → Golden Equation → Categorize → Review → Learn → Sync

Test it out and watch the AI get smarter with every correction! 🚀
