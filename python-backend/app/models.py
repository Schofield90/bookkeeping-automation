"""
Data Models for AI Bookkeeping System
Pydantic models for request/response validation
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Literal
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID


# ============================================================================
# Request Models
# ============================================================================

class ProcessStatementRequest(BaseModel):
    """Request to process a bank statement"""
    statement_id: UUID
    file_path: str
    organization_id: UUID


class UpdateTransactionRequest(BaseModel):
    """Request to update a transaction with user feedback"""
    transaction_id: UUID
    approved_account_code: str
    approved_account_name: str
    organization_id: UUID


class SyncToXeroRequest(BaseModel):
    """Request to sync statement to Xero"""
    statement_id: UUID
    organization_id: UUID


# ============================================================================
# Response Models
# ============================================================================

class TransactionData(BaseModel):
    """Individual transaction from OCR/parsing"""
    date: str
    description: str
    amount: float
    transaction_type: Optional[Literal['debit', 'credit', 'withdrawal', 'deposit']] = None

    @validator('amount')
    def amount_must_be_valid(cls, v):
        if v == 0:
            raise ValueError('Transaction amount cannot be zero')
        return v


class ExtractedStatementData(BaseModel):
    """Data extracted from a bank statement"""
    header_opening_balance: float
    header_closing_balance: float
    transactions: List[TransactionData]
    statement_period_start: Optional[date] = None
    statement_period_end: Optional[date] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ocr_confidence: Optional[float] = None


class ReconciliationResult(BaseModel):
    """Result of statement reconciliation check"""
    is_valid: bool
    calculated_closing_balance: float
    header_closing_balance: float
    discrepancy_amount: float
    error_message: Optional[str] = None


class ProcessStatementResponse(BaseModel):
    """Response from statement processing"""
    statement_id: UUID
    status: str
    reconciliation_result: ReconciliationResult
    transactions_count: int
    message: str


class TransactionReviewItem(BaseModel):
    """Transaction item for review interface"""
    id: UUID
    transaction_date: date
    description: str
    amount: Decimal
    transaction_type: str
    assigned_account_code: Optional[str] = None
    assigned_account_name: Optional[str] = None
    ai_confidence_score: float
    is_user_verified: bool
    needs_review: bool
    categorization_source: Optional[str] = None
    review_priority: int  # 1 = high priority (needs review), 2 = low priority


class ReviewFeedResponse(BaseModel):
    """Response for review feed endpoint"""
    statement_id: UUID
    total_transactions: int
    verified_count: int
    pending_count: int
    transactions: List[TransactionReviewItem]


class LearnedPattern(BaseModel):
    """Learned pattern from vector search"""
    id: UUID
    raw_text: str
    suggested_account_code: str
    suggested_account_name: str
    similarity: float
    times_used: int
    confidence_score: float


class CategorizationResult(BaseModel):
    """Result of AI categorization"""
    transaction_id: UUID
    assigned_account_code: str
    assigned_account_name: str
    ai_confidence_score: float
    categorization_source: Literal['vector_match', 'ai_llm', 'rule_match']
    reasoning: Optional[str] = None


class CategorizeStatementResponse(BaseModel):
    """Response from categorization endpoint"""
    statement_id: UUID
    categorized_count: int
    high_confidence_count: int
    needs_review_count: int
    results: List[CategorizationResult]


class UpdateTransactionResponse(BaseModel):
    """Response from transaction update"""
    transaction_id: UUID
    success: bool
    pattern_learned: bool
    message: str


class XeroSyncResponse(BaseModel):
    """Response from Xero sync"""
    statement_id: UUID
    success: bool
    synced_count: int
    xero_transaction_ids: List[str]
    errors: List[str]
    message: str


# ============================================================================
# Database Models (for internal use)
# ============================================================================

class ChartOfAccountsItem(BaseModel):
    """Chart of Accounts item"""
    code: str
    name: str
    type: Optional[str] = None
    description: Optional[str] = None


class XeroConfig(BaseModel):
    """Xero configuration for an organization"""
    id: UUID
    organization_id: UUID
    xero_tenant_id: str
    encrypted_access_token: Optional[str] = None
    encrypted_refresh_token: str
    token_expires_at: Optional[datetime] = None
    xero_org_name: Optional[str] = None
    chart_of_accounts: Optional[List[ChartOfAccountsItem]] = None
    chart_of_accounts_updated_at: Optional[datetime] = None
    auto_sync_enabled: bool = False
    sync_status: str = "connected"
