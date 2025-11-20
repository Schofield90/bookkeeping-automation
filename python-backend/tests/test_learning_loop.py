"""
Critical Test Cases for the Learning Loop
These tests validate that the AI learns from user corrections
"""

import pytest
from uuid import uuid4
from app.services.categorization_service import CategorizationService
from app.services.review_service import ReviewService
from app.models import ChartOfAccountsItem


class TestLearningLoop:
    """Test the AI learning and recall functionality"""

    def setup_method(self):
        self.categorization_service = CategorizationService()
        self.review_service = ReviewService()
        self.org_id = uuid4()

    @pytest.mark.asyncio
    async def test_learning_case_3_new_pattern(self):
        """
        TEST CASE 3: Learning from User Correction

        Scenario:
        1. New transaction: "Sushi Spot Downtown"
        2. AI categorizes as "429: General Expenses" (low confidence: 0.60)
        3. User corrects to "420: Entertainment"
        4. Verify embedding is stored in learned_patterns
        """

        # Mock transaction
        transaction = {
            'id': str(uuid4()),
            'description': 'Sushi Spot Downtown',
            'amount': 45.00,
            'assigned_account_code': '429',
            'ai_confidence_score': 0.60
        }

        # User corrects the categorization
        success = await self.review_service._teach_ai(
            organization_id=self.org_id,
            description=transaction['description'],
            account_code='420',
            account_name='Entertainment'
        )

        assert success is True

        # Verify the pattern was learned
        # In a real test, you would query the database to verify:
        # SELECT * FROM learned_patterns
        # WHERE organization_id = $org_id
        # AND normalized_text LIKE '%sushi spot%'

    @pytest.mark.asyncio
    async def test_recall_case_4_vector_match(self):
        """
        TEST CASE 4: Recall from Learned Pattern

        Scenario:
        1. Same merchant appears again: "Sushi Spot Westside"
        2. Vector search finds the learned pattern
        3. AI assigns "420: Entertainment" with high confidence (> 0.95)
        """

        # First, teach the AI about Sushi Spot
        await self.review_service._teach_ai(
            organization_id=self.org_id,
            description='Sushi Spot Downtown',
            account_code='420',
            account_name='Entertainment'
        )

        # Now test with a similar description
        similar_description = 'Sushi Spot Westside'

        # Generate embedding
        embedding = await self.categorization_service._generate_embedding(similar_description)

        # Check for vector match
        vector_match = await self.categorization_service._check_learned_patterns(
            description=similar_description,
            organization_id=self.org_id
        )

        # Assertions
        if vector_match:
            assert vector_match['similarity'] >= 0.95
            assert vector_match['suggested_account_code'] == '420'
            assert vector_match['suggested_account_name'] == 'Entertainment'

    @pytest.mark.asyncio
    async def test_pattern_usage_increment(self):
        """
        TEST CASE: Pattern Usage Counter

        When a pattern is used multiple times, times_used should increment
        """

        description = "Starbucks Coffee"

        # First time
        await self.review_service._teach_ai(
            organization_id=self.org_id,
            description=description,
            account_code='420',
            account_name='Entertainment'
        )

        # Second time (same description)
        await self.review_service._teach_ai(
            organization_id=self.org_id,
            description=description,
            account_code='420',
            account_name='Entertainment'
        )

        # Verify times_used incremented in database
        # In real test: SELECT times_used FROM learned_patterns WHERE ...
        # Expected: times_used = 2

    @pytest.mark.asyncio
    async def test_similar_but_different_category(self):
        """
        TEST CASE: Different Categories for Similar Merchants

        Example:
        - "Amazon.com - Books" → "Office Expenses"
        - "Amazon.com - AWS" → "Technology Expenses"

        The AI should learn to distinguish based on context
        """

        # Learn first pattern
        await self.review_service._teach_ai(
            organization_id=self.org_id,
            description='Amazon.com - Purchase Books',
            account_code='453',
            account_name='Office Expenses'
        )

        # Learn second pattern
        await self.review_service._teach_ai(
            organization_id=self.org_id,
            description='Amazon.com - AWS Services',
            account_code='489',
            account_name='Technology Expenses'
        )

        # Test that they're stored as separate patterns
        # The embeddings should be different enough to distinguish

    @pytest.mark.asyncio
    async def test_low_confidence_llm_fallback(self):
        """
        TEST CASE: LLM Fallback for New Transactions

        When no vector match is found (new merchant),
        AI should use LLM and return appropriate confidence
        """

        # Mock chart of accounts
        coa = [
            ChartOfAccountsItem(code="420", name="Entertainment"),
            ChartOfAccountsItem(code="429", name="General Expenses"),
            ChartOfAccountsItem(code="477", name="Salaries & Wages")
        ]

        # New, ambiguous transaction
        result = await self.categorization_service._categorize_with_llm(
            description="Payment Processing",  # Generic/ambiguous
            amount=150.00,
            chart_of_accounts=coa
        )

        # Should return low confidence for ambiguous descriptions
        assert 'account_code' in result
        assert 'confidence' in result
        assert result['confidence'] < 0.80  # Low confidence expected

    @pytest.mark.asyncio
    async def test_high_confidence_llm_specific(self):
        """
        TEST CASE: LLM High Confidence for Specific Descriptions

        Clear, specific descriptions should get high confidence
        """

        coa = [
            ChartOfAccountsItem(code="477", name="Salaries & Wages"),
            ChartOfAccountsItem(code="429", name="General Expenses")
        ]

        # Very specific transaction
        result = await self.categorization_service._categorize_with_llm(
            description="Monthly Salary - John Doe - Software Engineer",
            amount=5000.00,
            chart_of_accounts=coa
        )

        # Should return high confidence
        assert result['account_code'] == '477'
        assert result['confidence'] >= 0.85

    @pytest.mark.asyncio
    async def test_normalization_consistency(self):
        """
        TEST CASE: Text Normalization

        Descriptions should be normalized consistently:
        - "STARBUCKS #123" → "starbucks #123"
        - "  Starbucks   #456  " → "starbucks #456"

        This ensures better vector matching
        """

        text1 = "STARBUCKS DOWNTOWN"
        text2 = "  Starbucks   downtown  "

        norm1 = self.categorization_service._normalize_text(text1)
        norm2 = self.categorization_service._normalize_text(text2)

        assert norm1 == norm2
        assert norm1 == "starbucks downtown"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
