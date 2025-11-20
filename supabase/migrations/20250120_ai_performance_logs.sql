-- ============================================================================
-- AI Performance Monitoring Table
-- Created: 2025-01-20
-- Purpose: Track AI performance metrics to validate learning improvements
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_performance_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,

    -- Event tracking
    event_type TEXT NOT NULL CHECK (event_type IN (
        'initial_categorization',  -- AI first categorizes a transaction
        'user_confirmation',       -- User confirms AI suggestion was correct
        'user_correction',         -- User corrects AI suggestion
        'vector_match',            -- Vector search found a match
        'llm_categorization'       -- LLM was used for categorization
    )),

    -- AI performance data
    ai_suggested_account_code TEXT,
    ai_confidence_score DECIMAL(3, 2),
    user_approved_account_code TEXT,
    is_correction BOOLEAN DEFAULT FALSE,

    -- Categorization metadata
    categorization_source TEXT,  -- 'vector_match', 'ai_llm', 'rule_match'
    vector_similarity DECIMAL(3, 2),  -- If vector match was used

    -- Learning metrics
    pattern_already_existed BOOLEAN DEFAULT FALSE,
    pattern_times_used INTEGER DEFAULT 0,

    -- Context
    transaction_description TEXT,
    transaction_amount DECIMAL(19, 4),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance analysis queries
CREATE INDEX idx_ai_logs_org ON ai_performance_logs(organization_id);
CREATE INDEX idx_ai_logs_event_type ON ai_performance_logs(event_type);
CREATE INDEX idx_ai_logs_transaction ON ai_performance_logs(transaction_id);
CREATE INDEX idx_ai_logs_created_at ON ai_performance_logs(created_at DESC);
CREATE INDEX idx_ai_logs_corrections ON ai_performance_logs(is_correction) WHERE is_correction = TRUE;

-- Enable RLS
ALTER TABLE ai_performance_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their organization's AI logs"
    ON ai_performance_logs FOR SELECT
    USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Users can insert AI logs for their organization"
    ON ai_performance_logs FOR INSERT
    WITH CHECK (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Grant permissions
GRANT ALL ON ai_performance_logs TO authenticated;

-- ============================================================================
-- Analytics Views
-- ============================================================================

-- View: AI Correction Rate over time
CREATE OR REPLACE VIEW ai_correction_rate AS
SELECT
    organization_id,
    DATE_TRUNC('week', created_at) AS week,
    COUNT(*) FILTER (WHERE event_type = 'user_correction') AS corrections,
    COUNT(*) FILTER (WHERE event_type = 'user_confirmation') AS confirmations,
    COUNT(*) FILTER (WHERE event_type IN ('user_correction', 'user_confirmation')) AS total_reviews,
    ROUND(
        COUNT(*) FILTER (WHERE event_type = 'user_correction')::NUMERIC /
        NULLIF(COUNT(*) FILTER (WHERE event_type IN ('user_correction', 'user_confirmation')), 0) * 100,
        2
    ) AS correction_rate_percentage
FROM ai_performance_logs
GROUP BY organization_id, DATE_TRUNC('week', created_at)
ORDER BY week DESC;

-- View: AI Overconfidence Analysis
-- Shows cases where AI was confident but user corrected it
CREATE OR REPLACE VIEW ai_overconfidence_analysis AS
SELECT
    organization_id,
    ai_suggested_account_code,
    user_approved_account_code,
    AVG(ai_confidence_score) AS avg_confidence_when_wrong,
    COUNT(*) AS times_corrected,
    transaction_description
FROM ai_performance_logs
WHERE event_type = 'user_correction'
  AND ai_confidence_score >= 0.80  -- High confidence but wrong
GROUP BY organization_id, ai_suggested_account_code, user_approved_account_code, transaction_description
ORDER BY times_corrected DESC, avg_confidence_when_wrong DESC;

-- View: Vector Match Success Rate
CREATE OR REPLACE VIEW vector_match_success_rate AS
SELECT
    organization_id,
    DATE_TRUNC('month', created_at) AS month,
    COUNT(*) FILTER (WHERE categorization_source = 'vector_match') AS vector_matches,
    COUNT(*) FILTER (WHERE categorization_source = 'ai_llm') AS llm_categorizations,
    ROUND(
        COUNT(*) FILTER (WHERE categorization_source = 'vector_match')::NUMERIC /
        NULLIF(COUNT(*), 0) * 100,
        2
    ) AS vector_match_percentage
FROM ai_performance_logs
WHERE event_type = 'initial_categorization'
GROUP BY organization_id, DATE_TRUNC('month', created_at)
ORDER BY month DESC;

-- ============================================================================
-- Helper Functions
-- ============================================================================

-- Function to calculate AI accuracy over time
CREATE OR REPLACE FUNCTION calculate_ai_accuracy(
    org_id UUID,
    start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
    period DATE,
    total_categorizations BIGINT,
    correct_suggestions BIGINT,
    accuracy_percentage NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE(created_at) AS period,
        COUNT(*) AS total_categorizations,
        COUNT(*) FILTER (WHERE NOT is_correction) AS correct_suggestions,
        ROUND(
            COUNT(*) FILTER (WHERE NOT is_correction)::NUMERIC /
            NULLIF(COUNT(*), 0) * 100,
            2
        ) AS accuracy_percentage
    FROM ai_performance_logs
    WHERE organization_id = org_id
      AND created_at BETWEEN start_date AND end_date
      AND event_type IN ('user_confirmation', 'user_correction')
    GROUP BY DATE(created_at)
    ORDER BY period DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
