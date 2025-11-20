"""
Critical Test Cases for the Golden Equation (Safety Check)
These tests validate that the math reconciliation works correctly
"""

import pytest
from app.services.ingestion_service import IngestionService
from app.models import ExtractedStatementData, TransactionData


class TestGoldenEquation:
    """Test the Golden Equation validation logic"""

    def setup_method(self):
        self.ingestion_service = IngestionService()

    @pytest.mark.asyncio
    async def test_golden_equation_pass(self):
        """
        TEST CASE 1: Golden Equation PASS
        Opening: $1000
        Transactions: +$500 (credit), -$300 (debit)
        Closing: $1200
        Expected: is_valid = True
        """

        data = ExtractedStatementData(
            header_opening_balance=1000.00,
            header_closing_balance=1200.00,
            transactions=[
                TransactionData(
                    date="2025-01-15",
                    description="Deposit",
                    amount=500.00,
                    transaction_type="credit"
                ),
                TransactionData(
                    date="2025-01-16",
                    description="Withdrawal",
                    amount=300.00,
                    transaction_type="debit"
                )
            ]
        )

        # Validate reconciliation
        result = self.ingestion_service._validate_reconciliation(data)

        assert result.is_valid is True
        assert result.calculated_closing_balance == 1200.00
        assert result.header_closing_balance == 1200.00
        assert result.discrepancy_amount < 0.01
        assert result.error_message is None

    @pytest.mark.asyncio
    async def test_golden_equation_fail(self):
        """
        TEST CASE 2: Golden Equation FAIL
        Opening: $1000
        Transactions: +$500 (credit), -$300 (debit)
        Closing: $1500 (WRONG - should be $1200)
        Expected: is_valid = False, discrepancy = $300
        """

        data = ExtractedStatementData(
            header_opening_balance=1000.00,
            header_closing_balance=1500.00,  # WRONG!
            transactions=[
                TransactionData(
                    date="2025-01-15",
                    description="Deposit",
                    amount=500.00,
                    transaction_type="credit"
                ),
                TransactionData(
                    date="2025-01-16",
                    description="Withdrawal",
                    amount=300.00,
                    transaction_type="debit"
                )
            ]
        )

        # Validate reconciliation
        result = self.ingestion_service._validate_reconciliation(data)

        assert result.is_valid is False
        assert result.calculated_closing_balance == 1200.00
        assert result.header_closing_balance == 1500.00
        assert result.discrepancy_amount == 300.00
        assert result.error_message is not None
        assert "Discrepancy: $300" in result.error_message

    @pytest.mark.asyncio
    async def test_golden_equation_rounding_tolerance(self):
        """
        TEST CASE 3: Rounding Tolerance
        Small discrepancy (< $0.01) should pass
        """

        data = ExtractedStatementData(
            header_opening_balance=1000.00,
            header_closing_balance=1200.01,  # 1 cent off
            transactions=[
                TransactionData(
                    date="2025-01-15",
                    description="Deposit",
                    amount=500.00,
                    transaction_type="credit"
                ),
                TransactionData(
                    date="2025-01-16",
                    description="Withdrawal",
                    amount=300.00,
                    transaction_type="debit"
                )
            ]
        )

        result = self.ingestion_service._validate_reconciliation(data)

        assert result.is_valid is True  # Should pass within tolerance

    @pytest.mark.asyncio
    async def test_multiple_transactions_complex(self):
        """
        TEST CASE 4: Complex statement with many transactions
        """

        transactions = [
            TransactionData(date="2025-01-01", description="Salary", amount=5000.00, transaction_type="credit"),
            TransactionData(date="2025-01-02", description="Rent", amount=1500.00, transaction_type="debit"),
            TransactionData(date="2025-01-05", description="Groceries", amount=250.00, transaction_type="debit"),
            TransactionData(date="2025-01-10", description="Freelance", amount=1200.00, transaction_type="credit"),
            TransactionData(date="2025-01-15", description="Utilities", amount=150.00, transaction_type="debit"),
            TransactionData(date="2025-01-20", description="Gas", amount=75.50, transaction_type="debit"),
        ]

        # Calculate expected closing
        # Opening: $2000
        # +5000 +1200 -1500 -250 -150 -75.50 = +4224.50
        # Closing: $6224.50

        data = ExtractedStatementData(
            header_opening_balance=2000.00,
            header_closing_balance=6224.50,
            transactions=transactions
        )

        result = self.ingestion_service._validate_reconciliation(data)

        assert result.is_valid is True
        assert abs(result.calculated_closing_balance - 6224.50) < 0.01

    @pytest.mark.asyncio
    async def test_zero_transactions(self):
        """
        TEST CASE 5: Statement with no transactions
        """

        data = ExtractedStatementData(
            header_opening_balance=1000.00,
            header_closing_balance=1000.00,
            transactions=[]
        )

        result = self.ingestion_service._validate_reconciliation(data)

        assert result.is_valid is True
        assert result.calculated_closing_balance == 1000.00

    @pytest.mark.asyncio
    async def test_negative_balance(self):
        """
        TEST CASE 6: Overdraft scenario (negative balance)
        """

        data = ExtractedStatementData(
            header_opening_balance=100.00,
            header_closing_balance=-200.00,
            transactions=[
                TransactionData(
                    date="2025-01-15",
                    description="Large withdrawal",
                    amount=300.00,
                    transaction_type="debit"
                )
            ]
        )

        result = self.ingestion_service._validate_reconciliation(data)

        assert result.is_valid is True
        assert result.calculated_closing_balance == -200.00


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
