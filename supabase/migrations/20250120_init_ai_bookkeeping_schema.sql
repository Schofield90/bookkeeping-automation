-- ============================================================================
-- AI-Powered Bookkeeping Backend Schema
-- Created: 2025-01-20
-- Purpose: Support Vector Search (RAG), Reconciliation Logic, and Xero Integration
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";

-- ============================================================================
-- 1. ORGANIZATIONS TABLE (Root Tenant)
-- ============================================================================
-- This acts as the multi-tenant root for all data isolation

CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    domain TEXT UNIQUE,
    subscription_tier TEXT DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_organizations_domain ON organizations(domain);

-- ============================================================================
-- 2. BANK STATEMENTS TABLE (with Safety Check Status)
-- ============================================================================
-- Tracks uploaded statements and reconciliation status

CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- File reference
    file_path TEXT NOT NULL, -- Storage bucket path
    file_name TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT, -- 'csv', 'pdf', 'ofx', etc.

    -- Processing status
    status TEXT DEFAULT 'uploaded' CHECK (status IN (
        'uploaded',      -- File uploaded, not yet parsed
        'parsing',       -- Currently being parsed
        'parsed',        -- Successfully parsed
        'failed_parse',  -- Failed to parse
        'failed_math',   -- Math reconciliation failed
        'verified'       -- User verified the statement
    )),

    -- Reconciliation fields (The "Golden Equation")
    header_opening_balance DECIMAL(19, 4),  -- From statement header
    header_closing_balance DECIMAL(19, 4),  -- From statement header
    calculated_closing_balance DECIMAL(19, 4), -- opening_balance + sum(transactions)
    reconciliation_discrepancy BOOLEAN DEFAULT FALSE, -- TRUE if math doesn't match
    discrepancy_amount DECIMAL(19, 4), -- Absolute difference if any

    -- Metadata
    statement_period_start DATE,
    statement_period_end DATE,
    bank_name TEXT,
    account_number TEXT,
    account_type TEXT, -- 'checking', 'savings', 'credit_card'

    -- OCR/Parser metadata
    ocr_confidence DECIMAL(3, 2), -- 0.00-1.00 confidence from OCR
    parser_version TEXT,
    parser_notes TEXT,

    -- Timestamps
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    parsed_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_bank_statements_org ON bank_statements(organization_id);
CREATE INDEX idx_bank_statements_status ON bank_statements(status);
CREATE INDEX idx_bank_statements_period ON bank_statements(statement_period_start, statement_period_end);
CREATE INDEX idx_bank_statements_reconciliation ON bank_statements(reconciliation_discrepancy) WHERE reconciliation_discrepancy = TRUE;

-- ============================================================================
-- 3. TRANSACTIONS TABLE (Parsed Statement Lines)
-- ============================================================================
-- Individual transaction lines from bank statements

CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,

    -- Transaction details
    transaction_date DATE NOT NULL,
    post_date DATE, -- For credit cards
    description TEXT NOT NULL,
    payee TEXT, -- Cleaned/extracted payee name
    amount DECIMAL(19, 4) NOT NULL,
    transaction_type TEXT CHECK (transaction_type IN ('debit', 'credit', 'withdrawal', 'deposit')),
    balance DECIMAL(19, 4), -- Running balance if available

    -- Categorization
    assigned_account_code TEXT, -- Xero chart of accounts code (e.g., '400', '500')
    assigned_account_name TEXT, -- Human-readable name (e.g., 'Sales', 'Office Expenses')
    ai_confidence_score DECIMAL(3, 2) DEFAULT 0.00 CHECK (ai_confidence_score >= 0 AND ai_confidence_score <= 1), -- 0.00-1.00

    -- AI/Learning metadata
    categorization_source TEXT CHECK (categorization_source IN (
        'ai_suggestion',    -- From OpenAI/vector search
        'rule_match',       -- From learned_patterns exact match
        'user_manual',      -- User manually assigned
        'xero_sync'         -- Synced from Xero
    )),
    matched_pattern_id UUID, -- Reference to learned_patterns if applicable

    -- Verification
    is_user_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by UUID, -- User ID if you have user management
    needs_review BOOLEAN DEFAULT FALSE,
    review_notes TEXT,

    -- Xero sync status
    xero_transaction_id TEXT UNIQUE, -- Xero's transaction ID
    synced_to_xero BOOLEAN DEFAULT FALSE,
    synced_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_transactions_org ON transactions(organization_id);
CREATE INDEX idx_transactions_statement ON transactions(statement_id);
CREATE INDEX idx_transactions_date ON transactions(transaction_date);
CREATE INDEX idx_transactions_verification ON transactions(is_user_verified, needs_review);
CREATE INDEX idx_transactions_xero_sync ON transactions(synced_to_xero) WHERE synced_to_xero = FALSE;
CREATE INDEX idx_transactions_pattern ON transactions(matched_pattern_id) WHERE matched_pattern_id IS NOT NULL;

-- ============================================================================
-- 4. LEARNED_PATTERNS TABLE (AI Memory with Vector Search)
-- ============================================================================
-- This is the core of the AI learning system using pgvector for RAG

CREATE TABLE IF NOT EXISTS learned_patterns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    -- Pattern data
    raw_text TEXT NOT NULL, -- Original transaction description
    normalized_text TEXT NOT NULL, -- Cleaned/normalized version for better matching
    description_vector vector(1536), -- OpenAI text-embedding-ada-002 or text-embedding-3-small

    -- Categorization
    suggested_account_code TEXT NOT NULL,
    suggested_account_name TEXT NOT NULL,

    -- Learning metrics
    times_used INTEGER DEFAULT 1, -- How many times this pattern matched
    confidence_score DECIMAL(3, 2) DEFAULT 1.00, -- Overall pattern confidence

    -- Verification tracking
    times_verified INTEGER DEFAULT 0, -- How many times user confirmed this is correct
    times_rejected INTEGER DEFAULT 0, -- How many times user changed it
    last_verified_at TIMESTAMPTZ,

    -- Pattern metadata
    source TEXT CHECK (source IN ('user_verified', 'rule_import', 'xero_import')),
    pattern_type TEXT DEFAULT 'exact' CHECK (pattern_type IN ('exact', 'fuzzy', 'regex', 'vector')),

    -- Additional context for better matching
    amount_range_min DECIMAL(19, 4), -- Optional: pattern applies to specific amount ranges
    amount_range_max DECIMAL(19, 4),
    date_range_start DATE, -- Optional: seasonal patterns
    date_range_end DATE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_learned_patterns_org ON learned_patterns(organization_id);
CREATE INDEX idx_learned_patterns_account ON learned_patterns(suggested_account_code);
CREATE INDEX idx_learned_patterns_times_used ON learned_patterns(times_used DESC);

-- CRITICAL: Vector similarity search index using HNSW (Hierarchical Navigable Small World)
-- This enables fast cosine similarity search for RAG
CREATE INDEX idx_learned_patterns_vector ON learned_patterns
USING hnsw (description_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64); -- Tunable parameters

-- Alternative index using IVFFlat (may be faster for smaller datasets)
-- CREATE INDEX idx_learned_patterns_vector ON learned_patterns
-- USING ivfflat (description_vector vector_cosine_ops)
-- WITH (lists = 100);

-- ============================================================================
-- 5. XERO_CONFIGS TABLE (Encrypted Xero Integration)
-- ============================================================================
-- Stores Xero OAuth tokens and configuration per organization

CREATE TABLE IF NOT EXISTS xero_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

    -- Xero OAuth credentials (encrypted at application level)
    xero_tenant_id TEXT NOT NULL, -- Xero organization/tenant ID
    encrypted_access_token TEXT, -- Encrypted OAuth access token
    encrypted_refresh_token TEXT NOT NULL, -- Encrypted OAuth refresh token
    token_expires_at TIMESTAMPTZ,

    -- Xero organization info
    xero_org_name TEXT,
    xero_org_type TEXT, -- 'COMPANY', 'CHARITY', etc.
    xero_country_code TEXT,

    -- Chart of Accounts cache (to avoid repeated API calls)
    chart_of_accounts JSONB, -- Cached Xero CoA: [{ code: '400', name: 'Sales' }, ...]
    chart_of_accounts_updated_at TIMESTAMPTZ,

    -- Sync settings
    auto_sync_enabled BOOLEAN DEFAULT FALSE,
    sync_frequency_hours INTEGER DEFAULT 24,
    last_sync_at TIMESTAMPTZ,
    sync_status TEXT CHECK (sync_status IN ('connected', 'syncing', 'error', 'disconnected')),
    sync_error_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_xero_configs_org ON xero_configs(organization_id);
CREATE INDEX idx_xero_configs_sync_status ON xero_configs(sync_status);

-- ============================================================================
-- 6. USERS TABLE (Optional - for multi-user support)
-- ============================================================================
-- If you plan to have multiple users per organization

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

    email TEXT NOT NULL UNIQUE,
    full_name TEXT,
    role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),

    -- Auth (if not using Supabase Auth)
    password_hash TEXT,
    email_verified BOOLEAN DEFAULT FALSE,

    -- Preferences
    preferences JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_org ON users(organization_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================
-- Enable RLS on all tables for tenant isolation

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE xero_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Organizations: Users can only see their own organization
CREATE POLICY "Users can view their own organization"
    ON organizations FOR SELECT
    USING (id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their own organization"
    ON organizations FOR UPDATE
    USING (id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Bank Statements: Users can only access statements from their organization
CREATE POLICY "Users can view their organization's bank statements"
    ON bank_statements FOR SELECT
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert bank statements for their organization"
    ON bank_statements FOR INSERT
    WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their organization's bank statements"
    ON bank_statements FOR UPDATE
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their organization's bank statements"
    ON bank_statements FOR DELETE
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Transactions: Users can only access transactions from their organization
CREATE POLICY "Users can view their organization's transactions"
    ON transactions FOR SELECT
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert transactions for their organization"
    ON transactions FOR INSERT
    WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their organization's transactions"
    ON transactions FOR UPDATE
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their organization's transactions"
    ON transactions FOR DELETE
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Learned Patterns: Users can only access patterns from their organization
CREATE POLICY "Users can view their organization's learned patterns"
    ON learned_patterns FOR SELECT
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert learned patterns for their organization"
    ON learned_patterns FOR INSERT
    WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their organization's learned patterns"
    ON learned_patterns FOR UPDATE
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can delete their organization's learned patterns"
    ON learned_patterns FOR DELETE
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Xero Configs: Users can only access their organization's Xero config
CREATE POLICY "Users can view their organization's Xero config"
    ON xero_configs FOR SELECT
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert Xero config for their organization"
    ON xero_configs FOR INSERT
    WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can update their organization's Xero config"
    ON xero_configs FOR UPDATE
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Users: Users can view all users in their organization
CREATE POLICY "Users can view users in their organization"
    ON users FOR SELECT
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update_updated_at trigger to all tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_statements_updated_at BEFORE UPDATE ON bank_statements
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_learned_patterns_updated_at BEFORE UPDATE ON learned_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_xero_configs_updated_at BEFORE UPDATE ON xero_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function for vector similarity search (helper for RAG queries)
CREATE OR REPLACE FUNCTION find_similar_patterns(
    query_embedding vector(1536),
    org_id UUID,
    match_threshold FLOAT DEFAULT 0.7,
    match_count INT DEFAULT 5
)
RETURNS TABLE (
    id UUID,
    raw_text TEXT,
    suggested_account_code TEXT,
    suggested_account_name TEXT,
    similarity FLOAT,
    times_used INTEGER,
    confidence_score DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        lp.id,
        lp.raw_text,
        lp.suggested_account_code,
        lp.suggested_account_name,
        1 - (lp.description_vector <=> query_embedding) AS similarity,
        lp.times_used,
        lp.confidence_score
    FROM learned_patterns lp
    WHERE lp.organization_id = org_id
        AND 1 - (lp.description_vector <=> query_embedding) > match_threshold
    ORDER BY lp.description_vector <=> query_embedding ASC
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate reconciliation discrepancy
CREATE OR REPLACE FUNCTION check_statement_reconciliation()
RETURNS TRIGGER AS $$
DECLARE
    sum_transactions DECIMAL(19, 4);
BEGIN
    -- Calculate sum of all transactions for this statement
    SELECT COALESCE(SUM(
        CASE
            WHEN transaction_type IN ('credit', 'deposit') THEN amount
            WHEN transaction_type IN ('debit', 'withdrawal') THEN -amount
            ELSE 0
        END
    ), 0)
    INTO sum_transactions
    FROM transactions
    WHERE statement_id = NEW.id;

    -- Calculate the closing balance
    NEW.calculated_closing_balance := NEW.header_opening_balance + sum_transactions;

    -- Check if there's a discrepancy (allowing for 0.01 rounding tolerance)
    IF NEW.header_closing_balance IS NOT NULL THEN
        NEW.discrepancy_amount := ABS(NEW.header_closing_balance - NEW.calculated_closing_balance);

        IF NEW.discrepancy_amount > 0.01 THEN
            NEW.reconciliation_discrepancy := TRUE;
            NEW.status := 'failed_math';
        ELSE
            NEW.reconciliation_discrepancy := FALSE;
            IF NEW.status = 'parsing' THEN
                NEW.status := 'parsed';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically check reconciliation when transactions change
CREATE TRIGGER check_statement_reconciliation_trigger
    BEFORE UPDATE OF calculated_closing_balance ON bank_statements
    FOR EACH ROW
    EXECUTE FUNCTION check_statement_reconciliation();

-- ============================================================================
-- 9. SEED DATA (Optional - for development)
-- ============================================================================

-- Insert a demo organization
INSERT INTO organizations (name, domain, subscription_tier)
VALUES ('Demo Company', 'demo.example.com', 'pro')
ON CONFLICT (domain) DO NOTHING;

-- ============================================================================
-- 10. GRANT PERMISSIONS
-- ============================================================================

-- Grant usage on schema to authenticated users
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

-- Grant table permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant sequence permissions
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Grant function execution
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
