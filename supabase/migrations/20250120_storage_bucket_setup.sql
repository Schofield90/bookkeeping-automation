-- ============================================================================
-- Supabase Storage Bucket Setup for Financial Documents
-- Created: 2025-01-20
-- Purpose: Secure file storage for bank statements and financial documents
-- ============================================================================

-- ============================================================================
-- 1. CREATE STORAGE BUCKET
-- ============================================================================

-- Insert the bucket into storage.buckets table
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'financial-docs',
    'financial-docs',
    false, -- Private bucket (not publicly accessible)
    52428800, -- 50MB file size limit (50 * 1024 * 1024 bytes)
    ARRAY[
        'application/pdf',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'application/x-ofx', -- OFX bank statement format
        'application/xml'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 2. STORAGE BUCKET RLS POLICIES
-- ============================================================================
-- Users can only access files from their own organization

-- Policy: Users can upload files to their organization's folder
CREATE POLICY "Users can upload files to their organization folder"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'financial-docs'
        AND (storage.foldername(name))[1] = (
            SELECT organization_id::text
            FROM users
            WHERE id = auth.uid()
        )
    );

-- Policy: Users can view files from their organization
CREATE POLICY "Users can view their organization's files"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
        bucket_id = 'financial-docs'
        AND (storage.foldername(name))[1] = (
            SELECT organization_id::text
            FROM users
            WHERE id = auth.uid()
        )
    );

-- Policy: Users can update files from their organization
CREATE POLICY "Users can update their organization's files"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'financial-docs'
        AND (storage.foldername(name))[1] = (
            SELECT organization_id::text
            FROM users
            WHERE id = auth.uid()
        )
    );

-- Policy: Users can delete files from their organization
CREATE POLICY "Users can delete their organization's files"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'financial-docs'
        AND (storage.foldername(name))[1] = (
            SELECT organization_id::text
            FROM users
            WHERE id = auth.uid()
        )
    );

-- ============================================================================
-- 3. FILE NAMING CONVENTION
-- ============================================================================
-- Files should be organized as:
-- financial-docs/{organization_id}/{year}/{month}/{statement_id}_{filename}
--
-- Example:
-- financial-docs/550e8400-e29b-41d4-a716-446655440000/2025/01/abc123_bank_statement_jan_2025.pdf
--
-- This structure allows for:
-- - Easy tenant isolation via organization_id
-- - Chronological organization
-- - Unique identification via statement_id
-- - Original filename preservation
--
-- ============================================================================

-- ============================================================================
-- STORAGE SETUP COMPLETE
-- ============================================================================
--
-- To use this bucket in your application:
--
-- 1. Upload a file:
--    const { data, error } = await supabase.storage
--      .from('financial-docs')
--      .upload(`${orgId}/2025/01/${statementId}_${file.name}`, file)
--
-- 2. Get a signed URL (private access):
--    const { data } = await supabase.storage
--      .from('financial-docs')
--      .createSignedUrl(`${orgId}/2025/01/${statementId}_${file.name}`, 3600)
--
-- 3. Download a file:
--    const { data, error } = await supabase.storage
--      .from('financial-docs')
--      .download(`${orgId}/2025/01/${statementId}_${file.name}`)
--
-- ============================================================================
