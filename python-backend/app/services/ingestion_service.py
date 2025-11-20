"""
Ingestion Service with "Safety Check" Logic
Handles bank statement processing and the Golden Equation validation
"""

import logging
from typing import Dict, Any, List, Tuple
from uuid import UUID
from datetime import datetime
from decimal import Decimal

from app.config import get_settings
from app.models import (
    ExtractedStatementData,
    TransactionData,
    ReconciliationResult,
    ProcessStatementResponse
)
from app.utils.supabase_client import get_supabase_client
from app.utils.ocr_extractor import extract_data_from_file

logger = logging.getLogger(__name__)
settings = get_settings()


class IngestionService:
    """
    Handles the ingestion and validation of bank statements
    Implements the "Golden Equation" safety check
    """

    def __init__(self):
        self.supabase = get_supabase_client()

    async def process_statement(
        self,
        statement_id: UUID,
        file_path: str,
        organization_id: UUID
    ) -> ProcessStatementResponse:
        """
        Main entry point for statement processing
        Implements the critical "Safety Check" logic

        Flow:
        1. Download file from storage
        2. Extract data using OCR
        3. Validate the "Golden Equation"
        4. If valid: insert transactions, mark as VERIFIED
        5. If invalid: mark as FAILED_MATH, do NOT insert transactions
        """

        logger.info(f"Processing statement {statement_id} for org {organization_id}")

        try:
            # Step 1: Update status to 'parsing'
            await self.supabase.update_statement(statement_id, {
                'status': 'parsing',
                'parsed_at': datetime.utcnow().isoformat()
            })

            # Step 2: Download file from Supabase storage
            file_bytes = await self.supabase.download_file(file_path)
            if not file_bytes:
                raise Exception(f"Failed to download file from {file_path}")

            # Step 3: Extract data from PDF/CSV using OCR
            extracted_data = await extract_data_from_file(file_bytes, file_path)

            # Step 4: THE GOLDEN EQUATION - Validate reconciliation
            reconciliation = self._validate_reconciliation(extracted_data)

            # Step 5: Handle results based on reconciliation
            if reconciliation.is_valid:
                # Math matches! Insert transactions and mark as VERIFIED
                await self._handle_valid_statement(
                    statement_id,
                    organization_id,
                    extracted_data,
                    reconciliation
                )

                return ProcessStatementResponse(
                    statement_id=statement_id,
                    status='verified',
                    reconciliation_result=reconciliation,
                    transactions_count=len(extracted_data.transactions),
                    message="Statement processed successfully. Math checks out!"
                )
            else:
                # Math doesn't match! Mark as FAILED_MATH, DO NOT insert transactions
                await self._handle_invalid_statement(
                    statement_id,
                    extracted_data,
                    reconciliation
                )

                return ProcessStatementResponse(
                    statement_id=statement_id,
                    status='failed_math',
                    reconciliation_result=reconciliation,
                    transactions_count=0,
                    message=reconciliation.error_message or "Statement reconciliation failed"
                )

        except Exception as e:
            logger.error(f"Error processing statement {statement_id}: {e}")
            await self.supabase.update_statement(statement_id, {
                'status': 'failed_parse',
                'parser_notes': str(e)
            })

            return ProcessStatementResponse(
                statement_id=statement_id,
                status='failed_parse',
                reconciliation_result=ReconciliationResult(
                    is_valid=False,
                    calculated_closing_balance=0.0,
                    header_closing_balance=0.0,
                    discrepancy_amount=0.0,
                    error_message=f"Processing error: {str(e)}"
                ),
                transactions_count=0,
                message=f"Failed to process statement: {str(e)}"
            )

    def _validate_reconciliation(
        self,
        data: ExtractedStatementData
    ) -> ReconciliationResult:
        """
        THE GOLDEN EQUATION VALIDATOR

        Formula: Opening Balance + Sum(Transactions) = Closing Balance

        Rules:
        - Money IN (deposits/credits) is POSITIVE
        - Money OUT (withdrawals/debits) is NEGATIVE
        - We allow a tolerance of 0.01 for floating-point precision
        """

        opening_balance = Decimal(str(data.header_opening_balance))
        header_closing = Decimal(str(data.header_closing_balance))

        # Calculate sum of all transactions
        sum_transactions = Decimal('0')
        for txn in data.transactions:
            amount = Decimal(str(txn.amount))

            # Determine sign based on transaction type
            if txn.transaction_type in ['credit', 'deposit']:
                # Money coming IN is positive
                sum_transactions += amount
            elif txn.transaction_type in ['debit', 'withdrawal']:
                # Money going OUT is negative
                sum_transactions -= amount
            else:
                # If type is not specified, use the sign of the amount
                # Positive = credit, Negative = debit
                sum_transactions += amount

        # Calculate what the closing balance should be
        calculated_closing = opening_balance + sum_transactions

        # Calculate discrepancy
        discrepancy = abs(header_closing - calculated_closing)

        # Check if it matches (within tolerance)
        is_valid = discrepancy <= Decimal(str(settings.math_tolerance))

        error_message = None
        if not is_valid:
            error_message = (
                f"Statement reconciliation failed! "
                f"Opening: ${opening_balance:.2f}, "
                f"Transactions sum: ${sum_transactions:.2f}, "
                f"Expected closing: ${calculated_closing:.2f}, "
                f"Actual closing: ${header_closing:.2f}, "
                f"Discrepancy: ${discrepancy:.2f}"
            )

        return ReconciliationResult(
            is_valid=is_valid,
            calculated_closing_balance=float(calculated_closing),
            header_closing_balance=float(header_closing),
            discrepancy_amount=float(discrepancy),
            error_message=error_message
        )

    async def _handle_valid_statement(
        self,
        statement_id: UUID,
        organization_id: UUID,
        data: ExtractedStatementData,
        reconciliation: ReconciliationResult
    ):
        """
        Handle a statement that passed the Golden Equation check
        - Update statement status to 'parsed' (will become 'verified' after user review)
        - Insert all transactions
        """

        # Update statement with reconciliation data
        await self.supabase.update_statement(statement_id, {
            'status': 'parsed',
            'header_opening_balance': data.header_opening_balance,
            'header_closing_balance': data.header_closing_balance,
            'calculated_closing_balance': reconciliation.calculated_closing_balance,
            'reconciliation_discrepancy': False,
            'discrepancy_amount': reconciliation.discrepancy_amount,
            'statement_period_start': data.statement_period_start.isoformat() if data.statement_period_start else None,
            'statement_period_end': data.statement_period_end.isoformat() if data.statement_period_end else None,
            'bank_name': data.bank_name,
            'account_number': data.account_number,
            'ocr_confidence': data.ocr_confidence,
            'parsed_at': datetime.utcnow().isoformat()
        })

        # Prepare transactions for insertion
        transactions = []
        for txn in data.transactions:
            transactions.append({
                'organization_id': str(organization_id),
                'statement_id': str(statement_id),
                'transaction_date': txn.date,
                'description': txn.description,
                'amount': txn.amount,
                'transaction_type': txn.transaction_type,
                'ai_confidence_score': 0.0,  # Will be set by categorization service
                'is_user_verified': False,
                'needs_review': True,
                'categorization_source': None
            })

        # Bulk insert transactions
        await self.supabase.insert_transactions(transactions)

        logger.info(
            f"Statement {statement_id} validated successfully. "
            f"Inserted {len(transactions)} transactions."
        )

    async def _handle_invalid_statement(
        self,
        statement_id: UUID,
        data: ExtractedStatementData,
        reconciliation: ReconciliationResult
    ):
        """
        Handle a statement that FAILED the Golden Equation check
        - Update statement status to 'failed_math'
        - DO NOT insert transactions (safety gate)
        """

        # Update statement with failure information
        await self.supabase.update_statement(statement_id, {
            'status': 'failed_math',
            'header_opening_balance': data.header_opening_balance,
            'header_closing_balance': data.header_closing_balance,
            'calculated_closing_balance': reconciliation.calculated_closing_balance,
            'reconciliation_discrepancy': True,
            'discrepancy_amount': reconciliation.discrepancy_amount,
            'parser_notes': reconciliation.error_message,
            'parsed_at': datetime.utcnow().isoformat()
        })

        logger.warning(
            f"Statement {statement_id} FAILED reconciliation check. "
            f"Discrepancy: ${reconciliation.discrepancy_amount:.2f}. "
            f"NO transactions inserted."
        )


# Singleton instance
_ingestion_service = None


def get_ingestion_service() -> IngestionService:
    """Get or create the ingestion service singleton"""
    global _ingestion_service
    if _ingestion_service is None:
        _ingestion_service = IngestionService()
    return _ingestion_service
