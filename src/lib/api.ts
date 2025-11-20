/**
 * API Client for Python FastAPI Backend
 * Handles all communication with the AI bookkeeping backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ProcessStatementRequest {
  statement_id: string
  file_path: string
  organization_id: string
}

interface ProcessStatementResponse {
  statement_id: string
  status: string
  reconciliation_result: {
    is_valid: boolean
    calculated_closing_balance: number
    header_closing_balance: number
    discrepancy_amount: number
    error_message?: string
  }
  transactions_count: number
  message: string
}

interface TransactionReviewItem {
  id: string
  transaction_date: string
  description: string
  amount: number
  transaction_type: string
  assigned_account_code?: string
  assigned_account_name?: string
  ai_confidence_score: number
  is_user_verified: boolean
  needs_review: boolean
  categorization_source?: string
  review_priority: number
}

interface ReviewFeedResponse {
  statement_id: string
  total_transactions: number
  verified_count: number
  pending_count: number
  transactions: TransactionReviewItem[]
}

interface CategorizeStatementResponse {
  statement_id: string
  categorized_count: number
  high_confidence_count: number
  needs_review_count: number
}

interface UpdateTransactionRequest {
  transaction_id: string
  organization_id: string
  approved_account_code: string
  approved_account_name: string
}

interface UpdateTransactionResponse {
  transaction_id: string
  success: boolean
  pattern_learned: boolean
  message: string
}

interface XeroSyncResponse {
  statement_id: string
  success: boolean
  synced_count: number
  xero_transaction_ids: string[]
  errors: string[]
  message: string
}

/**
 * Process a bank statement (Golden Equation check)
 */
export async function processStatement(
  request: ProcessStatementRequest
): Promise<ProcessStatementResponse> {
  const response = await fetch(`${API_URL}/api/process-statement`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to process statement')
  }

  return response.json()
}

/**
 * Categorize transactions with AI (RAG + LLM)
 */
export async function categorizeStatement(
  statementId: string,
  organizationId: string
): Promise<CategorizeStatementResponse> {
  const response = await fetch(
    `${API_URL}/api/categorize-statement/${statementId}?organization_id=${organizationId}`,
    { method: 'POST' }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to categorize statement')
  }

  return response.json()
}

/**
 * Process and categorize in one call
 */
export async function processAndCategorize(
  statementId: string,
  filePath: string,
  organizationId: string
): Promise<any> {
  const response = await fetch(
    `${API_URL}/api/statement/${statementId}/process-and-categorize?file_path=${encodeURIComponent(filePath)}&organization_id=${organizationId}`,
    { method: 'POST' }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to process and categorize')
  }

  return response.json()
}

/**
 * Get review feed for a statement
 */
export async function getReviewFeed(
  statementId: string,
  organizationId: string
): Promise<ReviewFeedResponse> {
  const response = await fetch(
    `${API_URL}/api/statement/${statementId}/review?organization_id=${organizationId}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get review feed')
  }

  return response.json()
}

/**
 * Update transaction (THE LEARNING TRIGGER)
 */
export async function updateTransaction(
  request: UpdateTransactionRequest
): Promise<UpdateTransactionResponse> {
  const response = await fetch(`${API_URL}/api/transaction/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request)
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to update transaction')
  }

  return response.json()
}

/**
 * Connect to Xero (redirects to OAuth)
 */
export function connectToXero(organizationId: string): void {
  window.location.href = `${API_URL}/api/xero/connect?organization_id=${organizationId}`
}

/**
 * Sync statement to Xero
 */
export async function syncToXero(
  statementId: string,
  organizationId: string
): Promise<XeroSyncResponse> {
  const response = await fetch(
    `${API_URL}/api/statement/${statementId}/sync?organization_id=${organizationId}`,
    { method: 'POST' }
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to sync to Xero')
  }

  return response.json()
}

/**
 * Get AI correction rate
 */
export async function getCorrectionRate(
  organizationId: string,
  days: number = 30
): Promise<any> {
  const response = await fetch(
    `${API_URL}/api/analytics/correction-rate?organization_id=${organizationId}&days=${days}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get correction rate')
  }

  return response.json()
}

/**
 * Get overconfidence analysis
 */
export async function getOverconfidenceAnalysis(
  organizationId: string
): Promise<any> {
  const response = await fetch(
    `${API_URL}/api/analytics/overconfidence?organization_id=${organizationId}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get overconfidence analysis')
  }

  return response.json()
}

/**
 * Get learning effectiveness
 */
export async function getLearningEffectiveness(
  organizationId: string
): Promise<any> {
  const response = await fetch(
    `${API_URL}/api/analytics/learning-effectiveness?organization_id=${organizationId}`
  )

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to get learning effectiveness')
  }

  return response.json()
}

/**
 * Health check
 */
export async function healthCheck(): Promise<{ status: string }> {
  const response = await fetch(`${API_URL}/health`)
  return response.json()
}
