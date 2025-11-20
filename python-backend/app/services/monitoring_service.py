"""
AI Performance Monitoring Service
Logs AI events and provides analytics to validate learning improvements
"""

import logging
from typing import Dict, Any, Optional
from uuid import UUID
from datetime import datetime

from app.utils.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


class MonitoringService:
    """
    Tracks AI performance metrics to answer questions like:
    - Is the AI getting better over time?
    - What is the correction rate?
    - Is the AI overconfident in certain categories?
    - How often does vector search find matches vs. LLM?
    """

    def __init__(self):
        self.supabase = get_supabase_client()

    async def log_initial_categorization(
        self,
        transaction_id: UUID,
        organization_id: UUID,
        description: str,
        amount: float,
        suggested_account_code: str,
        confidence_score: float,
        categorization_source: str,
        vector_similarity: Optional[float] = None
    ):
        """
        Log when AI initially categorizes a transaction

        This creates a baseline to compare against user feedback
        """

        try:
            await self._insert_log({
                'transaction_id': str(transaction_id),
                'organization_id': str(organization_id),
                'event_type': 'initial_categorization',
                'ai_suggested_account_code': suggested_account_code,
                'ai_confidence_score': confidence_score,
                'categorization_source': categorization_source,
                'vector_similarity': vector_similarity,
                'transaction_description': description,
                'transaction_amount': amount
            })

        except Exception as e:
            logger.error(f"Error logging initial categorization: {e}")

    async def log_user_feedback(
        self,
        transaction_id: UUID,
        organization_id: UUID,
        original_account_code: Optional[str],
        corrected_account_code: str,
        is_correction: bool,
        original_confidence: float
    ):
        """
        Log when user provides feedback (confirms or corrects)

        This is critical for calculating:
        - Correction rate (how often AI is wrong)
        - Overconfidence (AI confident but wrong)
        - Learning effectiveness (does correction rate decrease over time?)
        """

        try:
            event_type = 'user_correction' if is_correction else 'user_confirmation'

            await self._insert_log({
                'transaction_id': str(transaction_id),
                'organization_id': str(organization_id),
                'event_type': event_type,
                'ai_suggested_account_code': original_account_code,
                'user_approved_account_code': corrected_account_code,
                'is_correction': is_correction,
                'ai_confidence_score': original_confidence
            })

            if is_correction:
                logger.info(
                    f"AI correction logged: {original_account_code} -> {corrected_account_code} "
                    f"(confidence was {original_confidence:.2f})"
                )

        except Exception as e:
            logger.error(f"Error logging user feedback: {e}")

    async def log_vector_match(
        self,
        transaction_id: UUID,
        organization_id: UUID,
        description: str,
        matched_pattern_id: UUID,
        similarity_score: float,
        pattern_times_used: int
    ):
        """
        Log when a vector search match is found

        This helps track the effectiveness of the learning system
        """

        try:
            await self._insert_log({
                'transaction_id': str(transaction_id),
                'organization_id': str(organization_id),
                'event_type': 'vector_match',
                'categorization_source': 'vector_match',
                'vector_similarity': similarity_score,
                'pattern_already_existed': True,
                'pattern_times_used': pattern_times_used,
                'transaction_description': description
            })

        except Exception as e:
            logger.error(f"Error logging vector match: {e}")

    async def log_llm_categorization(
        self,
        transaction_id: UUID,
        organization_id: UUID,
        description: str,
        amount: float,
        account_code: str,
        confidence: float
    ):
        """
        Log when LLM is used for categorization (no vector match found)

        Over time, this should decrease as the system learns more patterns
        """

        try:
            await self._insert_log({
                'transaction_id': str(transaction_id),
                'organization_id': str(organization_id),
                'event_type': 'llm_categorization',
                'categorization_source': 'ai_llm',
                'ai_suggested_account_code': account_code,
                'ai_confidence_score': confidence,
                'transaction_description': description,
                'transaction_amount': amount,
                'pattern_already_existed': False
            })

        except Exception as e:
            logger.error(f"Error logging LLM categorization: {e}")

    async def _insert_log(self, log_data: Dict[str, Any]):
        """Insert a log entry into bookkeeping_ai_performance_logs table"""
        try:
            self.supabase.get_client().table('bookkeeping_ai_performance_logs').insert(log_data).execute()
        except Exception as e:
            logger.error(f"Error inserting performance log: {e}")
            # Don't raise - monitoring should not break the main flow

    async def get_correction_rate(
        self,
        organization_id: UUID,
        days: int = 30
    ) -> Dict[str, Any]:
        """
        Calculate the AI correction rate over the last N days

        Lower correction rate = AI is getting better
        """

        try:
            # Query the correction rate view
            query = f"""
                SELECT
                    COUNT(*) FILTER (WHERE event_type = 'user_correction') AS corrections,
                    COUNT(*) FILTER (WHERE event_type = 'user_confirmation') AS confirmations,
                    COUNT(*) FILTER (WHERE event_type IN ('user_correction', 'user_confirmation')) AS total_reviews,
                    ROUND(
                        COUNT(*) FILTER (WHERE event_type = 'user_correction')::NUMERIC /
                        NULLIF(COUNT(*) FILTER (WHERE event_type IN ('user_correction', 'user_confirmation')), 0) * 100,
                        2
                    ) AS correction_rate
                FROM bookkeeping_ai_performance_logs
                WHERE organization_id = '{organization_id}'
                  AND created_at >= NOW() - INTERVAL '{days} days'
            """

            result = self.supabase.get_client().rpc('execute_sql', {'query': query}).execute()

            if result.data and len(result.data) > 0:
                data = result.data[0]
                return {
                    'corrections': data.get('corrections', 0),
                    'confirmations': data.get('confirmations', 0),
                    'total_reviews': data.get('total_reviews', 0),
                    'correction_rate_percentage': float(data.get('correction_rate', 0)),
                    'period_days': days
                }

            return {
                'corrections': 0,
                'confirmations': 0,
                'total_reviews': 0,
                'correction_rate_percentage': 0.0,
                'period_days': days
            }

        except Exception as e:
            logger.error(f"Error calculating correction rate: {e}")
            return {
                'error': str(e),
                'period_days': days
            }

    async def get_overconfidence_analysis(
        self,
        organization_id: UUID
    ) -> list:
        """
        Analyze cases where AI was confident but user corrected it

        This helps identify:
        - Which categories the AI struggles with
        - Whether confidence scores need calibration
        """

        try:
            response = self.supabase.get_client().table('bookkeeping_ai_performance_logs').select(
                'ai_suggested_account_code, user_approved_account_code, ai_confidence_score, transaction_description'
            ).eq('organization_id', str(organization_id)).eq(
                'event_type', 'user_correction'
            ).gte('ai_confidence_score', 0.80).execute()

            return response.data

        except Exception as e:
            logger.error(f"Error analyzing overconfidence: {e}")
            return []

    async def get_learning_effectiveness(
        self,
        organization_id: UUID
    ) -> Dict[str, Any]:
        """
        Measure learning effectiveness by comparing vector match rate over time

        As the system learns, more transactions should match learned patterns
        (vector_match) vs. requiring LLM analysis
        """

        try:
            query = f"""
                SELECT
                    DATE_TRUNC('month', created_at) AS month,
                    COUNT(*) FILTER (WHERE categorization_source = 'vector_match') AS vector_matches,
                    COUNT(*) FILTER (WHERE categorization_source = 'ai_llm') AS llm_categorizations,
                    ROUND(
                        COUNT(*) FILTER (WHERE categorization_source = 'vector_match')::NUMERIC /
                        NULLIF(COUNT(*), 0) * 100,
                        2
                    ) AS vector_match_percentage
                FROM bookkeeping_ai_performance_logs
                WHERE organization_id = '{organization_id}'
                  AND event_type = 'initial_categorization'
                  AND created_at >= NOW() - INTERVAL '6 months'
                GROUP BY DATE_TRUNC('month', created_at)
                ORDER BY month DESC
            """

            result = self.supabase.get_client().rpc('execute_sql', {'query': query}).execute()

            return {
                'monthly_data': result.data if result.data else [],
                'interpretation': 'Increasing vector_match_percentage over time indicates successful learning'
            }

        except Exception as e:
            logger.error(f"Error measuring learning effectiveness: {e}")
            return {'error': str(e)}


# Singleton instance
_monitoring_service = None


def get_monitoring_service() -> MonitoringService:
    """Get or create the monitoring service singleton"""
    global _monitoring_service
    if _monitoring_service is None:
        _monitoring_service = MonitoringService()
    return _monitoring_service
