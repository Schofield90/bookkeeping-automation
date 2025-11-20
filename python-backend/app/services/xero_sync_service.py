"""
Xero Sync Service
Syncs verified transactions to Xero accounting software
"""

import logging
from typing import List, Dict, Any
from uuid import UUID
from datetime import datetime

from xero_python.api_client import ApiClient
from xero_python.api_client.configuration import Configuration
from xero_python.api_client.oauth2 import OAuth2Token
from xero_python.accounting import AccountingApi, BankTransaction, LineItem, Contact

from app.config import get_settings
from app.utils.supabase_client import get_supabase_client
from app.services.xero_auth_service import get_xero_auth_service
from app.services.review_service import get_review_service
from app.models import XeroSyncResponse

logger = logging.getLogger(__name__)
settings = get_settings()


class XeroSyncService:
    """
    Syncs verified bank transactions to Xero

    CRITICAL SAFETY CHECK:
    - Will ONLY sync transactions where is_user_verified = True
    - This ensures all data going to the ledger has been reviewed by a human
    """

    def __init__(self):
        self.supabase = get_supabase_client()
        self.xero_auth = get_xero_auth_service()
        self.review_service = get_review_service()

        self.config = Configuration()
        self.config.client_id = settings.xero_client_id
        self.config.client_secret = settings.xero_client_secret

    async def sync_statement_to_xero(
        self,
        statement_id: UUID,
        organization_id: UUID
    ) -> XeroSyncResponse:
        """
        Sync a bank statement to Xero

        PRE-CONDITION CHECK:
        All transactions must have is_user_verified = True

        Flow:
        1. Check if all transactions are verified (safety gate)
        2. Get valid Xero access token
        3. Format transactions for Xero API
        4. Push to Xero
        5. Update sync status
        """

        logger.info(f"Attempting to sync statement {statement_id} to Xero")

        try:
            # STEP 1: PRE-CONDITION CHECK (Safety Gate)
            ready_check = await self.review_service.check_ready_for_sync(
                statement_id,
                organization_id
            )

            if not ready_check['ready']:
                logger.warning(
                    f"Statement {statement_id} not ready for sync: {ready_check['reason']}"
                )

                return XeroSyncResponse(
                    statement_id=statement_id,
                    success=False,
                    synced_count=0,
                    xero_transaction_ids=[],
                    errors=[ready_check['reason']],
                    message=f"Cannot sync: {ready_check['reason']}"
                )

            # STEP 2: Get valid access token
            access_token = await self.xero_auth.get_valid_access_token(organization_id)

            if not access_token:
                return XeroSyncResponse(
                    statement_id=statement_id,
                    success=False,
                    synced_count=0,
                    xero_transaction_ids=[],
                    errors=["Xero not connected or token invalid"],
                    message="Please reconnect to Xero"
                )

            # Get Xero tenant ID
            xero_config = await self.supabase.get_xero_config(organization_id)
            xero_tenant_id = xero_config['xero_tenant_id']

            # STEP 3: Get transactions
            transactions = await self.supabase.get_transactions_for_statement(
                statement_id,
                organization_id
            )

            # Filter only verified transactions (double-check)
            verified_transactions = [
                t for t in transactions
                if t.get('is_user_verified', False)
            ]

            if len(verified_transactions) == 0:
                return XeroSyncResponse(
                    statement_id=statement_id,
                    success=False,
                    synced_count=0,
                    xero_transaction_ids=[],
                    errors=["No verified transactions to sync"],
                    message="Please verify transactions first"
                )

            # STEP 4: Sync to Xero
            sync_results = await self._push_transactions_to_xero(
                verified_transactions,
                access_token,
                xero_tenant_id
            )

            # STEP 5: Update database with sync results
            synced_count = 0
            errors = []

            for result in sync_results:
                if result['success']:
                    await self.supabase.update_transaction(
                        UUID(result['transaction_id']),
                        {
                            'synced_to_xero': True,
                            'xero_transaction_id': result['xero_id'],
                            'synced_at': datetime.utcnow().isoformat()
                        }
                    )
                    synced_count += 1
                else:
                    errors.append(result['error'])

            # Update statement status if all synced
            if synced_count == len(verified_transactions):
                await self.supabase.update_statement(statement_id, {
                    'status': 'synced'  # Custom status for synced statements
                })

            logger.info(
                f"Synced {synced_count}/{len(verified_transactions)} transactions to Xero"
            )

            return XeroSyncResponse(
                statement_id=statement_id,
                success=len(errors) == 0,
                synced_count=synced_count,
                xero_transaction_ids=[r['xero_id'] for r in sync_results if r['success']],
                errors=errors,
                message=f"Successfully synced {synced_count} transactions to Xero"
            )

        except Exception as e:
            logger.error(f"Error syncing statement {statement_id} to Xero: {e}")

            return XeroSyncResponse(
                statement_id=statement_id,
                success=False,
                synced_count=0,
                xero_transaction_ids=[],
                errors=[str(e)],
                message=f"Sync failed: {str(e)}"
            )

    async def _push_transactions_to_xero(
        self,
        transactions: List[Dict[str, Any]],
        access_token: str,
        xero_tenant_id: str
    ) -> List[Dict[str, Any]]:
        """
        Push transactions to Xero API

        Each transaction becomes a BankTransaction in Xero
        """

        results = []

        # Create API client
        api_client = ApiClient(
            self.config,
            oauth2_token=OAuth2Token(access_token=access_token)
        )

        accounting_api = AccountingApi(api_client)

        for txn in transactions:
            try:
                # Format transaction for Xero
                xero_transaction = self._format_transaction_for_xero(txn)

                # Push to Xero with retry logic
                response = await self._push_with_retry(
                    accounting_api,
                    xero_tenant_id,
                    xero_transaction
                )

                if response and response.bank_transactions:
                    xero_id = response.bank_transactions[0].bank_transaction_id

                    results.append({
                        'transaction_id': txn['id'],
                        'success': True,
                        'xero_id': str(xero_id)
                    })
                else:
                    results.append({
                        'transaction_id': txn['id'],
                        'success': False,
                        'error': 'No response from Xero'
                    })

            except Exception as e:
                logger.error(f"Error pushing transaction {txn['id']} to Xero: {e}")
                results.append({
                    'transaction_id': txn['id'],
                    'success': False,
                    'error': str(e)
                })

        return results

    def _format_transaction_for_xero(self, txn: Dict[str, Any]) -> BankTransaction:
        """
        Format our transaction to Xero BankTransaction format

        Xero expects:
        - Type: SPEND (money out) or RECEIVE (money in)
        - Contact: The payee
        - LineItems: One or more line items with account codes
        - Date
        """

        # Determine transaction type
        if txn['transaction_type'] in ['debit', 'withdrawal']:
            transaction_type = 'SPEND'
        else:
            transaction_type = 'RECEIVE'

        # Create contact (simplified - in production you'd match to existing contacts)
        contact = Contact(
            name=txn.get('payee') or txn['description'][:50]  # Use description if no payee
        )

        # Create line item with the categorization
        line_item = LineItem(
            description=txn['description'],
            quantity=1.0,
            unit_amount=float(txn['amount']),
            account_code=txn['assigned_account_code'],
            tax_type='NONE'  # Simplified - you'd set proper tax type in production
        )

        # Create bank transaction
        bank_transaction = BankTransaction(
            type=transaction_type,
            contact=contact,
            line_items=[line_item],
            date=txn['transaction_date'],
            reference=f"Import {txn['id']}"
        )

        return bank_transaction

    async def _push_with_retry(
        self,
        accounting_api: AccountingApi,
        xero_tenant_id: str,
        transaction: BankTransaction,
        max_retries: int = 4
    ):
        """
        Push to Xero with exponential backoff retry logic
        Handles rate limiting
        """

        import time
        import asyncio

        for attempt in range(max_retries):
            try:
                response = accounting_api.create_bank_transactions(
                    xero_tenant_id,
                    bank_transactions={'bank_transactions': [transaction]},
                    summarize_errors=False
                )

                return response

            except Exception as e:
                error_msg = str(e)

                # Check if it's a rate limit error
                if 'rate limit' in error_msg.lower() or '429' in error_msg:
                    if attempt < max_retries - 1:
                        # Exponential backoff: 2s, 4s, 8s, 16s
                        wait_time = 2 ** (attempt + 1)
                        logger.warning(
                            f"Rate limited by Xero, retrying in {wait_time}s "
                            f"(attempt {attempt + 1}/{max_retries})"
                        )
                        await asyncio.sleep(wait_time)
                        continue

                # Not rate limit or max retries reached
                raise

        raise Exception("Max retries exceeded")


# Singleton
_xero_sync_service = None


def get_xero_sync_service() -> XeroSyncService:
    """Get or create Xero sync service singleton"""
    global _xero_sync_service
    if _xero_sync_service is None:
        _xero_sync_service = XeroSyncService()
    return _xero_sync_service
