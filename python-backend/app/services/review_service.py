"""
Review and Learning Service
Handles the review interface and implements the learning feedback loop
"""

import logging
from typing import List
from uuid import UUID
from datetime import datetime

from app.config import get_settings
from app.models import (
    ReviewFeedResponse,
    TransactionReviewItem,
    UpdateTransactionResponse
)
from app.utils.supabase_client import get_supabase_client
from app.services.categorization_service import get_categorization_service

logger = logging.getLogger(__name__)
settings = get_settings()


class ReviewService:
    """
    Handles the Review Feed and implements the Learning Loop
    This is where the AI learns from user corrections
    """

    def __init__(self):
        self.supabase = get_supabase_client()
        self.categorization_service = get_categorization_service()

    async def get_review_feed(
        self,
        statement_id: UUID,
        organization_id: UUID
    ) -> ReviewFeedResponse:
        """
        Get the review feed for a statement

        Sorting Priority:
        1. Low confidence (< 90%) or needs_review = True (RED - Needs Attention)
        2. High confidence items (GREEN - Likely Correct)
        """

        # Get all transactions for the statement
        transactions = await self.supabase.get_transactions_for_statement(
            statement_id,
            organization_id
        )

        if not transactions:
            return ReviewFeedResponse(
                statement_id=statement_id,
                total_transactions=0,
                verified_count=0,
                pending_count=0,
                transactions=[]
            )

        # Transform to review items with priority
        review_items = []
        verified_count = 0
        pending_count = 0

        for txn in transactions:
            is_verified = txn.get('is_user_verified', False)
            needs_review = txn.get('needs_review', True)
            confidence = txn.get('ai_confidence_score', 0.0)

            # Determine priority
            # Priority 1: Needs review (low confidence or flagged)
            # Priority 2: High confidence, already good
            if needs_review or confidence < settings.ai_confidence_threshold:
                priority = 1  # High priority - needs attention
                pending_count += 1
            else:
                priority = 2  # Low priority - likely correct
                if is_verified:
                    verified_count += 1
                else:
                    pending_count += 1

            review_items.append(TransactionReviewItem(
                id=UUID(txn['id']),
                transaction_date=txn['transaction_date'],
                description=txn['description'],
                amount=txn['amount'],
                transaction_type=txn['transaction_type'],
                assigned_account_code=txn.get('assigned_account_code'),
                assigned_account_name=txn.get('assigned_account_name'),
                ai_confidence_score=confidence,
                is_user_verified=is_verified,
                needs_review=needs_review,
                categorization_source=txn.get('categorization_source'),
                review_priority=priority
            ))

        # Sort by priority (1 first), then by date
        review_items.sort(key=lambda x: (x.review_priority, x.transaction_date))

        return ReviewFeedResponse(
            statement_id=statement_id,
            total_transactions=len(transactions),
            verified_count=verified_count,
            pending_count=pending_count,
            transactions=review_items
        )

    async def update_transaction_with_feedback(
        self,
        transaction_id: UUID,
        organization_id: UUID,
        approved_account_code: str,
        approved_account_name: str
    ) -> UpdateTransactionResponse:
        """
        THE LEARNING ENGINE

        When a user confirms or corrects a category, we must "teach" the system.

        Flow:
        1. Get the transaction
        2. Update the transaction with user's choice
        3. THE LEARNING TRIGGER: Insert/update learned_patterns with embedding
        4. This ensures next time a similar transaction appears, vector search finds it
        """

        try:
            # Get the transaction
            txn = await self.supabase.get_transaction(transaction_id, organization_id)

            if not txn:
                return UpdateTransactionResponse(
                    transaction_id=transaction_id,
                    success=False,
                    pattern_learned=False,
                    message="Transaction not found"
                )

            description = txn['description']
            old_account_code = txn.get('assigned_account_code')

            # Check if user made a correction
            is_correction = old_account_code != approved_account_code

            # Update the transaction
            await self.supabase.update_transaction(
                transaction_id,
                {
                    'assigned_account_code': approved_account_code,
                    'assigned_account_name': approved_account_name,
                    'is_user_verified': True,
                    'needs_review': False,
                    'verified_at': datetime.utcnow().isoformat()
                }
            )

            # THE LEARNING TRIGGER
            # Generate embedding and store in learned_patterns
            pattern_learned = await self._teach_ai(
                organization_id,
                description,
                approved_account_code,
                approved_account_name
            )

            # Log this event for AI performance monitoring
            from app.services.monitoring_service import get_monitoring_service
            monitoring = get_monitoring_service()

            await monitoring.log_user_feedback(
                transaction_id=transaction_id,
                organization_id=organization_id,
                original_account_code=old_account_code,
                corrected_account_code=approved_account_code,
                is_correction=is_correction,
                original_confidence=txn.get('ai_confidence_score', 0.0)
            )

            message = "Transaction updated and AI trained successfully!" if pattern_learned else \
                      "Transaction updated (AI training skipped)"

            if is_correction:
                logger.info(
                    f"User corrected transaction {transaction_id}: "
                    f"{old_account_code} -> {approved_account_code}"
                )

            return UpdateTransactionResponse(
                transaction_id=transaction_id,
                success=True,
                pattern_learned=pattern_learned,
                message=message
            )

        except Exception as e:
            logger.error(f"Error updating transaction {transaction_id}: {e}")
            return UpdateTransactionResponse(
                transaction_id=transaction_id,
                success=False,
                pattern_learned=False,
                message=f"Error: {str(e)}"
            )

    async def _teach_ai(
        self,
        organization_id: UUID,
        description: str,
        account_code: str,
        account_name: str
    ) -> bool:
        """
        Teach the AI by storing a new learned pattern

        This is the core of the learning system:
        1. Generate embedding for the description
        2. Store in learned_patterns table with the approved categorization
        3. Next time a similar description appears, vector search will find this pattern
        """

        try:
            # Generate embedding
            embedding = await self.categorization_service._generate_embedding(description)

            # Normalize description for better matching
            normalized_text = self.categorization_service._normalize_text(description)

            # Upsert the learned pattern
            success = await self.supabase.upsert_learned_pattern(
                org_id=organization_id,
                raw_text=description,
                normalized_text=normalized_text,
                embedding=embedding,
                account_code=account_code,
                account_name=account_name
            )

            if success:
                logger.info(
                    f"AI learned new pattern: '{description}' -> {account_code} ({account_name})"
                )

            return success

        except Exception as e:
            logger.error(f"Error teaching AI: {e}")
            return False

    async def check_ready_for_sync(
        self,
        statement_id: UUID,
        organization_id: UUID
    ) -> dict:
        """
        Check if a statement is ready to be synced to Xero

        Requirement: ALL transactions must have is_user_verified = True
        This is the safety gate before syncing to the ledger
        """

        transactions = await self.supabase.get_transactions_for_statement(
            statement_id,
            organization_id
        )

        if not transactions:
            return {
                'ready': False,
                'reason': 'No transactions found',
                'total_transactions': 0,
                'verified_count': 0,
                'unverified_count': 0
            }

        total_count = len(transactions)
        verified_count = sum(1 for t in transactions if t.get('is_user_verified', False))
        unverified_count = total_count - verified_count

        ready = unverified_count == 0

        return {
            'ready': ready,
            'reason': None if ready else f"{unverified_count} transaction(s) still need review",
            'total_transactions': total_count,
            'verified_count': verified_count,
            'unverified_count': unverified_count
        }


# Singleton instance
_review_service = None


def get_review_service() -> ReviewService:
    """Get or create the review service singleton"""
    global _review_service
    if _review_service is None:
        _review_service = ReviewService()
    return _review_service
