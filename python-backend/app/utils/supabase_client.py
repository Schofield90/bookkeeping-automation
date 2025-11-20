"""
Supabase Client Wrapper
Provides convenient methods for database operations
"""

from supabase import create_client, Client
from app.config import get_settings
from typing import Optional, List, Dict, Any
from uuid import UUID
import logging

logger = logging.getLogger(__name__)
settings = get_settings()


class SupabaseClient:
    """Wrapper for Supabase client with common operations"""

    def __init__(self):
        self.client: Client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key  # Use service role for backend operations
        )

    def get_client(self) -> Client:
        """Get the underlying Supabase client"""
        return self.client

    # ========================================================================
    # Bank Statements Operations
    # ========================================================================

    async def get_statement(self, statement_id: UUID, org_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a bank statement by ID"""
        try:
            response = self.client.table('bank_statements').select('*').eq(
                'id', str(statement_id)
            ).eq('organization_id', str(org_id)).single().execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting statement {statement_id}: {e}")
            return None

    async def update_statement(self, statement_id: UUID, data: Dict[str, Any]) -> bool:
        """Update a bank statement"""
        try:
            self.client.table('bank_statements').update(data).eq(
                'id', str(statement_id)
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating statement {statement_id}: {e}")
            return False

    # ========================================================================
    # Transactions Operations
    # ========================================================================

    async def insert_transactions(self, transactions: List[Dict[str, Any]]) -> bool:
        """Bulk insert transactions"""
        try:
            self.client.table('transactions').insert(transactions).execute()
            return True
        except Exception as e:
            logger.error(f"Error inserting transactions: {e}")
            return False

    async def get_transactions_for_statement(
        self, statement_id: UUID, org_id: UUID
    ) -> List[Dict[str, Any]]:
        """Get all transactions for a statement"""
        try:
            response = self.client.table('transactions').select('*').eq(
                'statement_id', str(statement_id)
            ).eq('organization_id', str(org_id)).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting transactions for statement {statement_id}: {e}")
            return []

    async def update_transaction(self, transaction_id: UUID, data: Dict[str, Any]) -> bool:
        """Update a transaction"""
        try:
            self.client.table('transactions').update(data).eq(
                'id', str(transaction_id)
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating transaction {transaction_id}: {e}")
            return False

    async def get_transaction(self, transaction_id: UUID, org_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a single transaction"""
        try:
            response = self.client.table('transactions').select('*').eq(
                'id', str(transaction_id)
            ).eq('organization_id', str(org_id)).single().execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting transaction {transaction_id}: {e}")
            return None

    # ========================================================================
    # Learned Patterns Operations (Vector Search)
    # ========================================================================

    async def find_similar_patterns(
        self,
        query_embedding: List[float],
        org_id: UUID,
        match_threshold: float = 0.7,
        match_count: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Find similar patterns using pgvector similarity search
        Uses the find_similar_patterns function created in the migration
        """
        try:
            # Call the PostgreSQL function directly
            response = self.client.rpc(
                'find_similar_patterns',
                {
                    'query_embedding': query_embedding,
                    'org_id': str(org_id),
                    'match_threshold': match_threshold,
                    'match_count': match_count
                }
            ).execute()
            return response.data
        except Exception as e:
            logger.error(f"Error finding similar patterns: {e}")
            return []

    async def insert_learned_pattern(self, pattern: Dict[str, Any]) -> bool:
        """Insert a new learned pattern"""
        try:
            self.client.table('learned_patterns').insert(pattern).execute()
            return True
        except Exception as e:
            logger.error(f"Error inserting learned pattern: {e}")
            return False

    async def upsert_learned_pattern(
        self,
        org_id: UUID,
        raw_text: str,
        normalized_text: str,
        embedding: List[float],
        account_code: str,
        account_name: str
    ) -> bool:
        """
        Insert or update a learned pattern
        If a similar pattern exists, increment its usage count
        """
        try:
            # First check if a very similar pattern exists (exact match on normalized text)
            existing = self.client.table('learned_patterns').select('*').eq(
                'organization_id', str(org_id)
            ).eq('normalized_text', normalized_text).eq(
                'suggested_account_code', account_code
            ).execute()

            if existing.data and len(existing.data) > 0:
                # Update existing pattern
                pattern_id = existing.data[0]['id']
                self.client.table('learned_patterns').update({
                    'times_used': existing.data[0]['times_used'] + 1,
                    'times_verified': existing.data[0].get('times_verified', 0) + 1,
                    'last_verified_at': 'now()',
                    'description_vector': embedding  # Update embedding
                }).eq('id', pattern_id).execute()
            else:
                # Insert new pattern
                await self.insert_learned_pattern({
                    'organization_id': str(org_id),
                    'raw_text': raw_text,
                    'normalized_text': normalized_text,
                    'description_vector': embedding,
                    'suggested_account_code': account_code,
                    'suggested_account_name': account_name,
                    'times_used': 1,
                    'times_verified': 1,
                    'last_verified_at': 'now()',
                    'source': 'user_verified',
                    'pattern_type': 'vector'
                })

            return True
        except Exception as e:
            logger.error(f"Error upserting learned pattern: {e}")
            return False

    # ========================================================================
    # Xero Config Operations
    # ========================================================================

    async def get_xero_config(self, org_id: UUID) -> Optional[Dict[str, Any]]:
        """Get Xero configuration for an organization"""
        try:
            response = self.client.table('xero_configs').select('*').eq(
                'organization_id', str(org_id)
            ).single().execute()
            return response.data
        except Exception as e:
            logger.error(f"Error getting Xero config for org {org_id}: {e}")
            return None

    async def update_xero_config(self, org_id: UUID, data: Dict[str, Any]) -> bool:
        """Update Xero configuration"""
        try:
            self.client.table('xero_configs').update(data).eq(
                'organization_id', str(org_id)
            ).execute()
            return True
        except Exception as e:
            logger.error(f"Error updating Xero config for org {org_id}: {e}")
            return False

    # ========================================================================
    # Storage Operations
    # ========================================================================

    async def download_file(self, file_path: str) -> Optional[bytes]:
        """Download a file from Supabase storage"""
        try:
            response = self.client.storage.from_('financial-docs').download(file_path)
            return response
        except Exception as e:
            logger.error(f"Error downloading file {file_path}: {e}")
            return None


# Singleton instance
_supabase_client: Optional[SupabaseClient] = None


def get_supabase_client() -> SupabaseClient:
    """Get or create the Supabase client singleton"""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = SupabaseClient()
    return _supabase_client
