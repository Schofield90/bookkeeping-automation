"""
AI Categorization Service - The Brain
Implements Hybrid RAG Strategy: Vector Search (learned patterns) + LLM fallback
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from uuid import UUID
import asyncio

from openai import AsyncOpenAI

from app.config import get_settings
from app.models import (
    ChartOfAccountsItem,
    CategorizationResult,
    CategorizeStatementResponse,
    LearnedPattern
)
from app.utils.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)
settings = get_settings()


class CategorizationService:
    """
    The AI Brain - Hybrid categorization using:
    1. Vector Search (RAG) - Check learned patterns first
    2. LLM Analysis - Use GPT for new/ambiguous transactions
    """

    def __init__(self):
        self.supabase = get_supabase_client()
        self.openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

    async def categorize_statement(
        self,
        statement_id: UUID,
        organization_id: UUID,
        chart_of_accounts: Optional[List[ChartOfAccountsItem]] = None
    ) -> CategorizeStatementResponse:
        """
        Main entry point for categorizing all transactions in a statement

        Flow:
        1. Load Chart of Accounts (COA) for the organization
        2. For each transaction:
           a. Try vector search against learned_patterns (Step A)
           b. If no high-confidence match, use LLM (Step B)
        3. Update transactions table with results
        """

        logger.info(f"Categorizing statement {statement_id} for org {organization_id}")

        # Load Chart of Accounts
        if chart_of_accounts is None:
            chart_of_accounts = await self._load_chart_of_accounts(organization_id)

        if not chart_of_accounts:
            # Provide mock COA if none available
            chart_of_accounts = self._get_mock_chart_of_accounts()
            logger.warning(f"Using mock COA for org {organization_id}")

        # Get all transactions for this statement
        transactions = await self.supabase.get_transactions_for_statement(
            statement_id,
            organization_id
        )

        if not transactions:
            logger.warning(f"No transactions found for statement {statement_id}")
            return CategorizeStatementResponse(
                statement_id=statement_id,
                categorized_count=0,
                high_confidence_count=0,
                needs_review_count=0,
                results=[]
            )

        # Categorize transactions in batches
        results = []
        batch_size = settings.max_batch_size

        for i in range(0, len(transactions), batch_size):
            batch = transactions[i:i + batch_size]
            batch_results = await self._categorize_batch(
                batch,
                organization_id,
                chart_of_accounts
            )
            results.extend(batch_results)

        # Calculate statistics
        high_confidence_count = sum(
            1 for r in results if r.ai_confidence_score >= settings.ai_confidence_threshold
        )
        needs_review_count = len(results) - high_confidence_count

        return CategorizeStatementResponse(
            statement_id=statement_id,
            categorized_count=len(results),
            high_confidence_count=high_confidence_count,
            needs_review_count=needs_review_count,
            results=results
        )

    async def _categorize_batch(
        self,
        transactions: List[Dict[str, Any]],
        organization_id: UUID,
        chart_of_accounts: List[ChartOfAccountsItem]
    ) -> List[CategorizationResult]:
        """
        Categorize a batch of transactions
        """

        results = []

        for txn in transactions:
            result = await self._categorize_single_transaction(
                txn,
                organization_id,
                chart_of_accounts
            )
            results.append(result)

            # Update the transaction in database
            await self.supabase.update_transaction(
                UUID(txn['id']),
                {
                    'assigned_account_code': result.assigned_account_code,
                    'assigned_account_name': result.assigned_account_name,
                    'ai_confidence_score': result.ai_confidence_score,
                    'categorization_source': result.categorization_source,
                    'needs_review': result.ai_confidence_score < settings.ai_confidence_threshold
                }
            )

        return results

    async def _categorize_single_transaction(
        self,
        txn: Dict[str, Any],
        organization_id: UUID,
        chart_of_accounts: List[ChartOfAccountsItem]
    ) -> CategorizationResult:
        """
        HYBRID CATEGORIZATION LOGIC

        Step A: Memory Check (Vector Search)
        - Generate embedding for description
        - Query learned_patterns table
        - If similarity > 0.95, use that match (high confidence)

        Step B: Reasoning (LLM Analysis)
        - If no vector match, use GPT to analyze
        - Provide COA context
        - Get account code + confidence
        """

        description = txn['description']
        transaction_id = UUID(txn['id'])

        # STEP A: Vector Search (The Memory Check)
        vector_match = await self._check_learned_patterns(
            description,
            organization_id
        )

        if vector_match and vector_match['similarity'] >= settings.vector_similarity_threshold:
            # HIGH CONFIDENCE MATCH FROM HISTORY!
            logger.info(
                f"Transaction '{description}' matched learned pattern "
                f"with {vector_match['similarity']:.2%} similarity"
            )

            return CategorizationResult(
                transaction_id=transaction_id,
                assigned_account_code=vector_match['suggested_account_code'],
                assigned_account_name=vector_match['suggested_account_name'],
                ai_confidence_score=0.99,  # Very high confidence from vector match
                categorization_source='vector_match',
                reasoning=f"Matched learned pattern (similarity: {vector_match['similarity']:.2%})"
            )

        # STEP B: LLM Analysis (For new/ambiguous transactions)
        logger.info(f"No high-confidence vector match for '{description}', using LLM")

        llm_result = await self._categorize_with_llm(
            description,
            txn['amount'],
            chart_of_accounts
        )

        return CategorizationResult(
            transaction_id=transaction_id,
            assigned_account_code=llm_result['account_code'],
            assigned_account_name=llm_result['account_name'],
            ai_confidence_score=llm_result['confidence'],
            categorization_source='ai_llm',
            reasoning=llm_result.get('reasoning', 'LLM categorization')
        )

    async def _check_learned_patterns(
        self,
        description: str,
        organization_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """
        Check if we have a learned pattern for this description
        Uses pgvector similarity search
        """

        try:
            # Generate embedding for the description
            embedding = await self._generate_embedding(description)

            # Query learned_patterns using vector similarity
            matches = await self.supabase.find_similar_patterns(
                query_embedding=embedding,
                org_id=organization_id,
                match_threshold=settings.vector_similarity_threshold,
                match_count=1  # We only need the best match
            )

            if matches and len(matches) > 0:
                return matches[0]

            return None

        except Exception as e:
            logger.error(f"Error checking learned patterns: {e}")
            return None

    async def _categorize_with_llm(
        self,
        description: str,
        amount: float,
        chart_of_accounts: List[ChartOfAccountsItem]
    ) -> Dict[str, Any]:
        """
        Use LLM to categorize a transaction

        The LLM is constrained to:
        1. Only choose from the provided Chart of Accounts
        2. Provide a confidence score based on description specificity
        3. Return reasoning for the choice
        """

        # Format COA for prompt
        coa_text = "\n".join([
            f"- {account.code}: {account.name}"
            for account in chart_of_accounts
        ])

        prompt = f"""You are an expert bookkeeper. Categorize this transaction into the correct account code.

Transaction Details:
- Description: "{description}"
- Amount: ${amount:.2f}

Available Chart of Accounts:
{coa_text}

Rules:
1. Choose the MOST APPROPRIATE account code from the list above
2. Provide a confidence score (0.0-1.0):
   - High confidence (0.9-1.0): Very specific, clear transaction (e.g., "Salary - John Doe")
   - Medium confidence (0.7-0.89): Reasonably clear (e.g., "Office supplies - Staples")
   - Low confidence (0.5-0.69): Ambiguous or generic (e.g., "Purchase", "Payment")
3. Provide brief reasoning

Respond in JSON format:
{{
    "account_code": "XXX",
    "account_name": "Name",
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation"
}}"""

        try:
            response = await self.openai_client.chat.completions.create(
                model="gpt-4o-mini",  # Fast and cost-effective
                messages=[
                    {
                        "role": "system",
                        "content": "You are a bookkeeping expert. Return only valid JSON."
                    },
                    {
                        "role": "user",
                        "content": prompt
                    }
                ],
                response_format={"type": "json_object"},
                temperature=0.1  # Low temperature for consistency
            )

            result = response.choices[0].message.content
            if not result:
                raise Exception("Empty response from LLM")

            import json
            parsed_result = json.loads(result)

            # Validate the response
            if 'account_code' not in parsed_result or 'confidence' not in parsed_result:
                raise Exception("Invalid LLM response format")

            # Ensure confidence is in valid range
            confidence = float(parsed_result['confidence'])
            confidence = max(0.0, min(1.0, confidence))

            return {
                'account_code': parsed_result['account_code'],
                'account_name': parsed_result.get('account_name', 'Unknown'),
                'confidence': confidence,
                'reasoning': parsed_result.get('reasoning', '')
            }

        except Exception as e:
            logger.error(f"Error categorizing with LLM: {e}")

            # Fallback to "Uncategorized" with low confidence
            return {
                'account_code': '999',
                'account_name': 'Uncategorized',
                'confidence': 0.0,
                'reasoning': f'LLM categorization failed: {str(e)}'
            }

    async def _generate_embedding(self, text: str) -> List[float]:
        """
        Generate embedding vector for text using OpenAI
        Uses text-embedding-3-small (1536 dimensions)
        """

        try:
            # Normalize text
            normalized_text = self._normalize_text(text)

            response = await self.openai_client.embeddings.create(
                model=settings.openai_embedding_model,
                input=normalized_text
            )

            return response.data[0].embedding

        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            raise

    def _normalize_text(self, text: str) -> str:
        """
        Normalize transaction description for better matching
        - Lowercase
        - Remove extra whitespace
        - Remove special characters (optional)
        """
        normalized = text.lower().strip()
        normalized = ' '.join(normalized.split())  # Remove extra whitespace
        return normalized

    async def _load_chart_of_accounts(
        self,
        organization_id: UUID
    ) -> List[ChartOfAccountsItem]:
        """
        Load Chart of Accounts from Xero config
        """

        try:
            xero_config = await self.supabase.get_xero_config(organization_id)

            if xero_config and xero_config.get('chart_of_accounts'):
                coa_data = xero_config['chart_of_accounts']
                return [ChartOfAccountsItem(**item) for item in coa_data]

            return []

        except Exception as e:
            logger.error(f"Error loading chart of accounts: {e}")
            return []

    def _get_mock_chart_of_accounts(self) -> List[ChartOfAccountsItem]:
        """
        Mock Chart of Accounts for development/testing
        Based on standard Xero account codes
        """

        return [
            ChartOfAccountsItem(code="200", name="Sales", type="revenue"),
            ChartOfAccountsItem(code="260", name="Other Revenue", type="revenue"),
            ChartOfAccountsItem(code="400", name="Advertising", type="expense"),
            ChartOfAccountsItem(code="404", name="Bank Fees", type="expense"),
            ChartOfAccountsItem(code="408", name="Cleaning", type="expense"),
            ChartOfAccountsItem(code="412", name="Consulting & Accounting", type="expense"),
            ChartOfAccountsItem(code="416", name="Depreciation", type="expense"),
            ChartOfAccountsItem(code="420", name="Entertainment", type="expense"),
            ChartOfAccountsItem(code="425", name="Freight & Courier", type="expense"),
            ChartOfAccountsItem(code="429", name="General Expenses", type="expense"),
            ChartOfAccountsItem(code="433", name="Insurance", type="expense"),
            ChartOfAccountsItem(code="437", name="Interest Expense", type="expense"),
            ChartOfAccountsItem(code="441", name="Legal Expenses", type="expense"),
            ChartOfAccountsItem(code="445", name="Light, Power, Heating", type="expense"),
            ChartOfAccountsItem(code="449", name="Motor Vehicle Expenses", type="expense"),
            ChartOfAccountsItem(code="453", name="Office Expenses", type="expense"),
            ChartOfAccountsItem(code="461", name="Printing & Stationery", type="expense"),
            ChartOfAccountsItem(code="469", name="Rent", type="expense"),
            ChartOfAccountsItem(code="473", name="Repairs & Maintenance", type="expense"),
            ChartOfAccountsItem(code="477", name="Salaries & Wages", type="expense"),
            ChartOfAccountsItem(code="485", name="Subscriptions", type="expense"),
            ChartOfAccountsItem(code="489", name="Telephone & Internet", type="expense"),
            ChartOfAccountsItem(code="493", name="Travel - National", type="expense"),
            ChartOfAccountsItem(code="494", name="Travel - International", type="expense"),
            ChartOfAccountsItem(code="999", name="Uncategorized", type="expense"),
        ]


# Singleton instance
_categorization_service = None


def get_categorization_service() -> CategorizationService:
    """Get or create the categorization service singleton"""
    global _categorization_service
    if _categorization_service is None:
        _categorization_service = CategorizationService()
    return _categorization_service
