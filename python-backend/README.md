# AI-Powered Bookkeeping Backend

## 🎯 Overview

This is a production-ready Python backend for an AI-powered bookkeeping system that:

1. **Ensures Data Integrity** - The "Golden Equation" validates all statements before processing
2. **Learns from User Behavior** - RAG-powered AI that improves with every correction
3. **Integrates with Xero** - Seamless sync to your accounting ledger
4. **Provides Safety Gates** - Multiple checkpoints ensure only verified data reaches your books

## 🏗️ Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                        │
│          Upload → Review → Approve → Sync                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│              Python Backend (FastAPI)                        │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Ingestion  │→│ Categorization│→│    Review     │        │
│  │   Service   │  │   Service     │  │   Service    │        │
│  │ (Safety)    │  │  (RAG+LLM)    │  │  (Learning)  │        │
│  └─────────────┘  └──────────────┘  └──────────────┘        │
│         │                 │                  │               │
│         └─────────────────┴──────────────────┘               │
│                           ↓                                  │
│                  ┌─────────────────┐                         │
│                  │  Xero Sync      │                         │
│                  │  Service        │                         │
│                  └─────────────────┘                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│           Supabase (Postgres + Storage + pgvector)           │
│  ┌───────────┐ ┌──────────────┐ ┌───────────────┐          │
│  │Statements │ │ Transactions │ │learned_patterns│          │
│  │           │ │              │ │  (Vector DB)   │          │
│  └───────────┘ └──────────────┘ └───────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

### The Processing Pipeline

#### 1. 📥 **Ingestion (The Safety Layer)**
```
File Upload → OCR Extraction → GOLDEN EQUATION CHECK
                                      ↓
                        ┌─────────────┴────────────┐
                        │                          │
                   ✅ PASS                      ❌ FAIL
            Insert Transactions        Mark FAILED_MATH
            Mark as PARSED             DO NOT insert
```

**The Golden Equation:**
```
Opening Balance + Σ(Transactions) = Closing Balance
```
If this doesn't match (within $0.01), the entire statement is rejected.

#### 2. 🧠 **Categorization (The AI Brain - Hybrid RAG)**
```
For each transaction:
    ↓
Step A: Check Vector DB (learned_patterns)
    ↓
Similarity > 0.95? ──YES→ Use learned pattern (confidence: 0.99)
    │
    NO
    ↓
Step B: Ask LLM (GPT-4o-mini)
    ↓
Return: Account Code + Confidence Score (0.0-1.0)
```

#### 3. 👥 **Review (The Learning Loop)**
```
User Reviews Transaction:
    ↓
Confirms or Corrects Category
    ↓
┌──────────────────────────────┐
│  THE LEARNING TRIGGER:        │
│  1. Generate embedding        │
│  2. Store in learned_patterns │
│  3. Next time → Vector match! │
└──────────────────────────────┘
```

#### 4. 🔄 **Xero Sync (The Final Gate)**
```
Sync Request
    ↓
PRE-CONDITION: All transactions verified? ──NO→ Reject with error
    │
   YES
    ↓
Sync to Xero
Update status
```

## 📁 Project Structure

```
python-backend/
├── app/
│   ├── main.py                          # FastAPI application & routes
│   ├── config.py                        # Configuration management
│   ├── models.py                        # Pydantic data models
│   │
│   ├── services/                        # Business logic
│   │   ├── ingestion_service.py         # Golden Equation validation
│   │   ├── categorization_service.py    # RAG + LLM hybrid AI
│   │   ├── review_service.py            # Learning loop
│   │   ├── xero_auth_service.py         # OAuth & token management
│   │   ├── xero_sync_service.py         # Ledger synchronization
│   │   └── monitoring_service.py        # AI performance tracking
│   │
│   └── utils/
│       ├── supabase_client.py           # Database operations
│       ├── ocr_extractor.py             # PDF/CSV parsing
│       └── encryption.py                # Token encryption
│
├── requirements.txt                     # Python dependencies
├── .env.example                         # Environment variables template
└── README.md                            # This file
```

## 🚀 Setup Instructions

### Prerequisites

- Python 3.10+
- Supabase account
- OpenAI API key
- Xero developer account

### 1. Install Dependencies

```bash
cd python-backend
pip install -r requirements.txt
```

### 2. Set Up Supabase

Run the migrations in order:

```bash
# Run these SQL files in your Supabase SQL editor:
supabase/migrations/20250120_init_ai_bookkeeping_schema.sql
supabase/migrations/20250120_storage_bucket_setup.sql
supabase/migrations/20250120_ai_performance_logs.sql
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

# Xero
XERO_CLIENT_ID=...
XERO_CLIENT_SECRET=...
XERO_REDIRECT_URI=http://localhost:8000/api/xero/callback

# Encryption (generate with: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
ENCRYPTION_KEY=your-32-byte-key
```

### 4. Run the Server

```bash
# Development
uvicorn app.main:app --reload --port 8000

# Production
uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4
```

## 📡 API Endpoints

### Statement Processing

#### POST `/api/process-statement`
Process and validate a bank statement (Golden Equation check)

**Request:**
```json
{
  "statement_id": "uuid",
  "file_path": "org_id/2025/01/filename.pdf",
  "organization_id": "uuid"
}
```

**Response:**
```json
{
  "statement_id": "uuid",
  "status": "verified",
  "reconciliation_result": {
    "is_valid": true,
    "calculated_closing_balance": 5000.00,
    "header_closing_balance": 5000.00,
    "discrepancy_amount": 0.00
  },
  "transactions_count": 45,
  "message": "Statement processed successfully. Math checks out!"
}
```

### AI Categorization

#### POST `/api/categorize-statement/{statement_id}`
Categorize transactions using hybrid RAG approach

**Response:**
```json
{
  "statement_id": "uuid",
  "categorized_count": 45,
  "high_confidence_count": 38,
  "needs_review_count": 7,
  "results": [...]
}
```

### Review & Learning

#### GET `/api/statement/{statement_id}/review`
Get review feed with prioritized transactions

**Response:**
```json
{
  "statement_id": "uuid",
  "total_transactions": 45,
  "verified_count": 0,
  "pending_count": 45,
  "transactions": [
    {
      "id": "uuid",
      "description": "STARBUCKS #123",
      "amount": 12.50,
      "assigned_account_code": "429",
      "assigned_account_name": "General Expenses",
      "ai_confidence_score": 0.65,
      "review_priority": 1  // 1 = needs attention
    }
  ]
}
```

#### POST `/api/transaction/update`
Update transaction and trigger learning

**Request:**
```json
{
  "transaction_id": "uuid",
  "organization_id": "uuid",
  "approved_account_code": "420",
  "approved_account_name": "Entertainment"
}
```

**Response:**
```json
{
  "transaction_id": "uuid",
  "success": true,
  "pattern_learned": true,
  "message": "Transaction updated and AI trained successfully!"
}
```

### Xero Integration

#### GET `/api/xero/connect?organization_id=uuid`
Initiate Xero OAuth flow

#### GET `/api/xero/callback`
OAuth callback (handled automatically)

#### POST `/api/statement/{statement_id}/sync?organization_id=uuid`
Sync verified transactions to Xero

**Response:**
```json
{
  "statement_id": "uuid",
  "success": true,
  "synced_count": 45,
  "xero_transaction_ids": ["...", "..."],
  "errors": [],
  "message": "Successfully synced 45 transactions to Xero"
}
```

### Analytics

#### GET `/api/analytics/correction-rate?organization_id=uuid&days=30`
Get AI correction rate (measures learning effectiveness)

#### GET `/api/analytics/overconfidence?organization_id=uuid`
Analyze cases where AI was confident but wrong

#### GET `/api/analytics/learning-effectiveness?organization_id=uuid`
Track vector match rate over time

## 🔒 Security Features

### Row Level Security (RLS)
All database tables use RLS for strict tenant isolation:
- Users can only access their organization's data
- Enforced at the database level (Supabase/Postgres)

### Token Encryption
Xero OAuth tokens are encrypted using Fernet (symmetric encryption):
- Tokens encrypted before storage
- Only decrypted briefly during API calls
- Encryption key managed via environment variables

### Rate Limiting
Xero API calls include exponential backoff:
- Automatic retry on rate limits
- Backoff: 2s, 4s, 8s, 16s
- Prevents API quota exhaustion

## 📊 How the AI Learns

### The Vector Database (learned_patterns)

Every time a user confirms or corrects a categorization:

1. **Generate Embedding** - Convert description to 1536-dimensional vector
2. **Store Pattern** - Insert into `learned_patterns` table with approved category
3. **Next Time** - Vector search finds similar transactions with 95%+ similarity

**Example Flow:**

```
First Time:
  "STARBUCKS DOWNTOWN" → LLM → "429: General Expenses" (confidence: 0.65)
  User corrects to → "420: Entertainment"
  → Embedding stored in learned_patterns

Second Time:
  "STARBUCKS WESTSIDE" → Vector Search → 0.97 similarity match!
  → "420: Entertainment" (confidence: 0.99) ✅ No LLM needed!
```

### Performance Metrics

Track these to validate learning:

1. **Correction Rate** - Should decrease over time
2. **Vector Match Rate** - Should increase over time
3. **Overconfidence Analysis** - Identify problematic categories

## ✅ Testing

### Critical Test Cases

#### 1. Golden Equation - Pass
```python
# Test data with matching math
opening: $1000
transactions: +$500, -$300
closing: $1200 ✅

Expected: status = 'parsed', 2 transactions inserted
```

#### 2. Golden Equation - Fail
```python
# Test data with math error
opening: $1000
transactions: +$500, -$300
closing: $1500 ❌ (should be $1200)

Expected: status = 'failed_math', 0 transactions inserted
```

#### 3. Learning Loop
```python
# First categorization
POST /transaction/update with "Starbucks" → "Entertainment"

# Verify learned_patterns has new row
SELECT * FROM learned_patterns WHERE raw_text ILIKE '%starbucks%'

# Second categorization
Process new "Starbucks" transaction
Expected: Vector match with 95%+ similarity
```

#### 4. Sync Gate
```python
# Attempt sync with unverified transactions
POST /statement/{id}/sync

Expected:
{
  "success": false,
  "errors": ["5 transaction(s) still need review"]
}
```

## 📈 Performance Considerations

- **Batch Processing**: Transactions processed in batches of 50
- **Vector Search**: HNSW index for O(log n) similarity search
- **Caching**: Chart of Accounts cached for 24 hours
- **Async Operations**: All I/O operations are async

## 🐛 Troubleshooting

### Common Issues

**OCR extraction failing:**
- Install tesseract-ocr: `brew install tesseract` (Mac) or `apt-get install tesseract-ocr` (Linux)

**Vector search not finding matches:**
- Ensure pgvector extension is enabled
- Check similarity threshold (default 0.95)

**Xero token refresh failing:**
- Verify encryption key is valid
- Check Xero app credentials

## 📚 Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [Xero API Reference](https://developer.xero.com/documentation/)
- [pgvector Documentation](https://github.com/pgvector/pgvector)

## 🤝 Contributing

When adding new features:
1. Maintain the safety checks (especially Golden Equation)
2. Log events to `ai_performance_logs` for monitoring
3. Add tests for critical paths
4. Update this README

## 📄 License

[Your License Here]

## 🎉 Congratulations!

You now have a production-ready AI bookkeeping backend that:
- ✅ Validates data integrity
- ✅ Learns from user behavior
- ✅ Integrates with Xero
- ✅ Provides comprehensive monitoring
- ✅ Scales with your business
