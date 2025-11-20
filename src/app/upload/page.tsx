'use client'

/**
 * Upload Page - Bank Statement Upload with Golden Equation Validation
 *
 * Flow:
 * 1. User uploads PDF/CSV
 * 2. File uploaded to Supabase Storage
 * 3. Backend processes with Golden Equation check
 * 4. If math passes: Categorize with AI
 * 5. Redirect to review page
 */

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { uploadBankStatement } from '@/lib/supabase'
import { processAndCategorize } from '@/lib/api'
import styles from './upload.module.css'

// Mock organization ID - in production, get from auth context
const MOCK_ORG_ID = '550e8400-e29b-41d4-a716-446655440000'

export default function UploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<string>('')

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      // Validate file type
      const validTypes = ['application/pdf', 'text/csv', 'application/vnd.ms-excel']
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv')) {
        setError('Please upload a PDF or CSV file')
        return
      }

      setFile(selectedFile)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    try {
      setUploading(true)
      setError(null)
      setProgress('Uploading file to storage...')

      // Step 1: Upload to Supabase Storage
      const { path, error: uploadError } = await uploadBankStatement(file, MOCK_ORG_ID)

      if (uploadError || !path) {
        throw new Error(uploadError || 'Failed to upload file')
      }

      setProgress('File uploaded! Processing statement...')
      setUploading(false)
      setProcessing(true)

      // Step 2: Generate statement ID
      const statementId = crypto.randomUUID()

      // Step 3: Process and categorize (Golden Equation + AI)
      setProgress('Validating reconciliation (Golden Equation)...')

      const result = await processAndCategorize(statementId, path, MOCK_ORG_ID)

      // Check if Golden Equation passed
      if (!result.processing.reconciliation_result.is_valid) {
        // Math check failed!
        setError(
          `⚠️ Statement Reconciliation Failed!\n\n${result.processing.reconciliation_result.error_message}\n\nPlease check the statement and try again.`
        )
        setProcessing(false)
        return
      }

      // Success! Redirect to review
      setProgress('✅ Statement verified! Redirecting to review...')

      setTimeout(() => {
        router.push(`/review/${statementId}`)
      }, 1500)

    } catch (err) {
      console.error('Upload error:', err)
      setError(err instanceof Error ? err.message : 'Failed to process statement')
      setUploading(false)
      setProcessing(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      setFile(droppedFile)
      setError(null)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Upload Bank Statement</h1>
          <p className={styles.subtitle}>
            Upload your bank statement (PDF or CSV) for AI-powered categorization
          </p>
        </div>

        <div className={styles.uploadCard}>
          {/* Drag & Drop Zone */}
          <div
            className={styles.dropzone}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              type="file"
              id="file-input"
              className={styles.fileInput}
              accept=".pdf,.csv"
              onChange={handleFileChange}
              disabled={uploading || processing}
            />

            <label htmlFor="file-input" className={styles.dropzoneLabel}>
              <div className={styles.uploadIcon}>📄</div>
              {file ? (
                <>
                  <p className={styles.fileName}>{file.name}</p>
                  <p className={styles.fileSize}>
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </>
              ) : (
                <>
                  <p className={styles.dropzoneText}>
                    Drag & drop your bank statement here, or click to browse
                  </p>
                  <p className={styles.dropzoneSubtext}>
                    Supports PDF and CSV files (max 50MB)
                  </p>
                </>
              )}
            </label>
          </div>

          {/* Error Display */}
          {error && (
            <div className={styles.error}>
              <div className={styles.errorIcon}>❌</div>
              <pre className={styles.errorText}>{error}</pre>
            </div>
          )}

          {/* Progress Display */}
          {(uploading || processing) && (
            <div className={styles.progress}>
              <div className={styles.progressIcon}>
                {processing ? '🔄' : '⬆️'}
              </div>
              <p className={styles.progressText}>{progress}</p>
              <div className={styles.progressBar}>
                <div className={styles.progressFill}></div>
              </div>
            </div>
          )}

          {/* Upload Button */}
          <button
            className={styles.uploadButton}
            onClick={handleUpload}
            disabled={!file || uploading || processing}
          >
            {uploading
              ? 'Uploading...'
              : processing
              ? 'Processing...'
              : 'Process Statement'}
          </button>

          {/* Info Box */}
          <div className={styles.infoBox}>
            <h3 className={styles.infoTitle}>🛡️ How It Works</h3>
            <ol className={styles.infoList}>
              <li>
                <strong>Upload:</strong> Your file is securely uploaded to encrypted storage
              </li>
              <li>
                <strong>Safety Check:</strong> The "Golden Equation" validates the math
                <br />
                <code className={styles.code}>
                  Opening Balance + Σ(Transactions) = Closing Balance
                </code>
              </li>
              <li>
                <strong>AI Categorization:</strong> Transactions are categorized using learned patterns + LLM
              </li>
              <li>
                <strong>Review:</strong> You review and approve/correct the AI's suggestions
              </li>
              <li>
                <strong>Learning:</strong> Your corrections teach the AI for future statements
              </li>
            </ol>
          </div>
        </div>
      </div>
    </main>
  )
}
