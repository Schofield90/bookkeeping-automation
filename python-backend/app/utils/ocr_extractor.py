"""
OCR and Data Extraction Utility
Handles PDF and CSV parsing to extract bank statement data
"""

import logging
import io
from typing import Optional
from datetime import datetime, date
import re

# PDF processing
import pdfplumber
import PyPDF2

# CSV processing
import csv
import pandas as pd

from app.models import ExtractedStatementData, TransactionData

logger = logging.getLogger(__name__)


async def extract_data_from_file(
    file_bytes: bytes,
    file_path: str
) -> ExtractedStatementData:
    """
    Main extraction function - routes to appropriate parser based on file type
    """
    file_ext = file_path.lower().split('.')[-1]

    if file_ext == 'pdf':
        return await extract_from_pdf(file_bytes)
    elif file_ext in ['csv', 'txt']:
        return await extract_from_csv(file_bytes)
    else:
        raise ValueError(f"Unsupported file type: {file_ext}")


async def extract_from_pdf(file_bytes: bytes) -> ExtractedStatementData:
    """
    Extract data from PDF bank statement using pdfplumber

    This is a TEMPLATE implementation that handles common bank statement formats.
    In production, you would:
    1. Use OCR for scanned PDFs (Tesseract, AWS Textract, Google Vision)
    2. Train custom models for specific bank formats
    3. Use rule-based parsing for structured PDFs
    """

    try:
        pdf_file = io.BytesIO(file_bytes)

        with pdfplumber.open(pdf_file) as pdf:
            full_text = ""
            for page in pdf.pages:
                full_text += page.extract_text() + "\n"

        # Parse the extracted text
        opening_balance = _extract_opening_balance(full_text)
        closing_balance = _extract_closing_balance(full_text)
        transactions = _extract_transactions_from_text(full_text)

        # Extract metadata
        period_start, period_end = _extract_statement_period(full_text)
        bank_name = _extract_bank_name(full_text)
        account_number = _extract_account_number(full_text)

        return ExtractedStatementData(
            header_opening_balance=opening_balance,
            header_closing_balance=closing_balance,
            transactions=transactions,
            statement_period_start=period_start,
            statement_period_end=period_end,
            bank_name=bank_name,
            account_number=account_number,
            ocr_confidence=0.85  # Mock confidence score
        )

    except Exception as e:
        logger.error(f"Error extracting from PDF: {e}")
        raise Exception(f"Failed to parse PDF: {str(e)}")


async def extract_from_csv(file_bytes: bytes) -> ExtractedStatementData:
    """
    Extract data from CSV bank statement

    Handles common CSV formats from major banks
    """

    try:
        csv_text = file_bytes.decode('utf-8')
        csv_file = io.StringIO(csv_text)

        # Try to detect if there's a header section (common in bank CSVs)
        lines = csv_text.split('\n')

        # Look for opening/closing balance in header lines
        opening_balance = 0.0
        closing_balance = 0.0
        data_start_line = 0

        for i, line in enumerate(lines[:20]):  # Check first 20 lines for header
            if 'opening balance' in line.lower():
                opening_balance = _extract_amount_from_line(line)
            elif 'closing balance' in line.lower():
                closing_balance = _extract_amount_from_line(line)
            elif 'date' in line.lower() and ('amount' in line.lower() or 'description' in line.lower()):
                data_start_line = i
                break

        # Parse transactions from CSV
        csv_file.seek(0)
        for _ in range(data_start_line):
            next(csv_file)

        reader = csv.DictReader(csv_file)
        transactions = []

        for row in reader:
            try:
                txn = _parse_csv_row(row)
                if txn:
                    transactions.append(txn)
            except Exception as e:
                logger.warning(f"Skipping invalid row: {e}")
                continue

        # If balances weren't in header, calculate from transactions
        if opening_balance == 0.0 and closing_balance == 0.0 and transactions:
            # This is a fallback - ideally we'd have these from the statement
            logger.warning("No header balances found, this may cause reconciliation issues")

        return ExtractedStatementData(
            header_opening_balance=opening_balance,
            header_closing_balance=closing_balance,
            transactions=transactions,
            ocr_confidence=0.95  # CSV is more reliable than OCR
        )

    except Exception as e:
        logger.error(f"Error extracting from CSV: {e}")
        raise Exception(f"Failed to parse CSV: {str(e)}")


def _parse_csv_row(row: dict) -> Optional[TransactionData]:
    """
    Parse a single CSV row into a transaction
    Handles various column naming conventions
    """

    # Try different column name variations
    date_fields = ['Date', 'date', 'Transaction Date', 'Trans Date', 'Posted Date']
    desc_fields = ['Description', 'description', 'Memo', 'Payee', 'Details']
    amount_fields = ['Amount', 'amount', 'Value', 'value']
    debit_fields = ['Debit', 'debit', 'Withdrawal', 'withdrawal']
    credit_fields = ['Credit', 'credit', 'Deposit', 'deposit']

    # Extract date
    date_str = None
    for field in date_fields:
        if field in row and row[field]:
            date_str = row[field]
            break

    if not date_str:
        return None

    # Extract description
    description = None
    for field in desc_fields:
        if field in row and row[field]:
            description = row[field]
            break

    if not description:
        return None

    # Extract amount and determine type
    amount = 0.0
    transaction_type = None

    # Check if there's a single amount column
    for field in amount_fields:
        if field in row and row[field]:
            amount_str = row[field].replace(',', '').replace('$', '').strip()
            if amount_str and amount_str not in ['', '-', 'N/A']:
                amount = abs(float(amount_str))
                # Determine type from sign or default to debit
                transaction_type = 'credit' if float(row[field].replace(',', '').replace('$', '')) > 0 else 'debit'
                break

    # Check for separate debit/credit columns
    if amount == 0.0:
        for field in debit_fields:
            if field in row and row[field] and row[field].strip() not in ['', '-', '0.00']:
                amount = abs(float(row[field].replace(',', '').replace('$', '').strip()))
                transaction_type = 'debit'
                break

        if amount == 0.0:
            for field in credit_fields:
                if field in row and row[field] and row[field].strip() not in ['', '-', '0.00']:
                    amount = abs(float(row[field].replace(',', '').replace('$', '').strip()))
                    transaction_type = 'credit'
                    break

    if amount == 0.0:
        return None

    return TransactionData(
        date=date_str,
        description=description.strip(),
        amount=amount,
        transaction_type=transaction_type or 'debit'
    )


def _extract_opening_balance(text: str) -> float:
    """Extract opening balance from statement text"""
    patterns = [
        r'opening balance[:\s]+\$?([0-9,]+\.[0-9]{2})',
        r'previous balance[:\s]+\$?([0-9,]+\.[0-9]{2})',
        r'balance forward[:\s]+\$?([0-9,]+\.[0-9]{2})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return float(match.group(1).replace(',', ''))

    return 0.0


def _extract_closing_balance(text: str) -> float:
    """Extract closing balance from statement text"""
    patterns = [
        r'closing balance[:\s]+\$?([0-9,]+\.[0-9]{2})',
        r'ending balance[:\s]+\$?([0-9,]+\.[0-9]{2})',
        r'final balance[:\s]+\$?([0-9,]+\.[0-9]{2})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return float(match.group(1).replace(',', ''))

    return 0.0


def _extract_amount_from_line(line: str) -> float:
    """Extract a dollar amount from a text line"""
    match = re.search(r'\$?([0-9,]+\.[0-9]{2})', line)
    if match:
        return float(match.group(1).replace(',', ''))
    return 0.0


def _extract_transactions_from_text(text: str) -> list[TransactionData]:
    """
    Extract transactions from unstructured text
    This is a simplified parser - production would use more sophisticated NLP
    """
    transactions = []
    lines = text.split('\n')

    # Pattern to match transaction lines (very basic)
    # Format: MM/DD/YYYY Description $Amount
    pattern = r'(\d{1,2}/\d{1,2}/\d{2,4})\s+(.+?)\s+\$?([0-9,]+\.[0-9]{2})'

    for line in lines:
        match = re.search(pattern, line)
        if match:
            date_str = match.group(1)
            description = match.group(2).strip()
            amount = float(match.group(3).replace(',', ''))

            # Determine if debit or credit (this is simplified)
            transaction_type = 'debit' if amount > 0 else 'credit'

            transactions.append(TransactionData(
                date=date_str,
                description=description,
                amount=abs(amount),
                transaction_type=transaction_type
            ))

    return transactions


def _extract_statement_period(text: str) -> tuple[Optional[date], Optional[date]]:
    """Extract statement period dates"""
    # Simplified - would need more robust parsing in production
    return None, None


def _extract_bank_name(text: str) -> Optional[str]:
    """Extract bank name from statement"""
    # Look for common bank names in first few lines
    banks = ['Chase', 'Bank of America', 'Wells Fargo', 'Citibank', 'Capital One']
    text_upper = text.upper()

    for bank in banks:
        if bank.upper() in text_upper[:500]:  # Check first 500 chars
            return bank

    return None


def _extract_account_number(text: str) -> Optional[str]:
    """Extract account number from statement"""
    pattern = r'account\s*(?:number|#)?[:\s]+([0-9X*]{4,})'
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return match.group(1)

    return None
