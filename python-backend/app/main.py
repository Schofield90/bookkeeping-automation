"""
AI-Powered Bookkeeping Backend - FastAPI Application
Main entry point for all API endpoints
"""

import logging
from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from uuid import UUID
import secrets

from app.config import get_settings
from app.models import (
    ProcessStatementRequest,
    ProcessStatementResponse,
    UpdateTransactionRequest,
    UpdateTransactionResponse,
    SyncToXeroRequest,
    XeroSyncResponse,
    ReviewFeedResponse,
    CategorizeStatementResponse
)

# Import services
from app.services.ingestion_service import get_ingestion_service
from app.services.categorization_service import get_categorization_service
from app.services.review_service import get_review_service
from app.services.xero_auth_service import get_xero_auth_service
from app.services.xero_sync_service import get_xero_sync_service
from app.services.monitoring_service import get_monitoring_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)
settings = get_settings()

# Create FastAPI app
app = FastAPI(
    title="AI Bookkeeping Backend",
    description="AI-powered bookkeeping with RAG, Safety Checks, and Xero Integration",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# HEALTH CHECK
# ============================================================================

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "AI Bookkeeping Backend",
        "status": "operational",
        "version": "1.0.0"
    }


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}


# ============================================================================
# STATEMENT PROCESSING (The Golden Equation)
# ============================================================================

@app.post("/api/process-statement", response_model=ProcessStatementResponse)
async def process_statement(request: ProcessStatementRequest):
    """
    Process a bank statement with the "Golden Equation" safety check

    Flow:
    1. Download file from Supabase storage
    2. Extract data using OCR
    3. Validate: Opening Balance + Sum(Transactions) = Closing Balance
    4. If valid: Insert transactions
    5. If invalid: Mark as FAILED_MATH, DO NOT insert transactions
    """

    logger.info(f"Processing statement {request.statement_id}")

    try:
        ingestion_service = get_ingestion_service()

        response = await ingestion_service.process_statement(
            statement_id=request.statement_id,
            file_path=request.file_path,
            organization_id=request.organization_id
        )

        return response

    except Exception as e:
        logger.error(f"Error processing statement: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AI CATEGORIZATION (The Brain - Hybrid RAG)
# ============================================================================

@app.post("/api/categorize-statement/{statement_id}", response_model=CategorizeStatementResponse)
async def categorize_statement(
    statement_id: UUID,
    organization_id: UUID = Query(...)
):
    """
    Categorize transactions using Hybrid AI approach

    Step A: Check learned_patterns (Vector Search)
    - If similarity > 0.95, use that match

    Step B: Use LLM (GPT-4)
    - If no high-confidence vector match, use LLM to categorize
    """

    logger.info(f"Categorizing statement {statement_id}")

    try:
        categorization_service = get_categorization_service()

        response = await categorization_service.categorize_statement(
            statement_id=statement_id,
            organization_id=organization_id
        )

        return response

    except Exception as e:
        logger.error(f"Error categorizing statement: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# REVIEW INTERFACE (The Learning Loop)
# ============================================================================

@app.get("/api/statement/{statement_id}/review", response_model=ReviewFeedResponse)
async def get_review_feed(
    statement_id: UUID,
    organization_id: UUID = Query(...)
):
    """
    Get the review feed for a statement

    Sorting:
    - Priority 1: Low confidence (< 90%) or needs_review = True
    - Priority 2: High confidence items
    """

    logger.info(f"Getting review feed for statement {statement_id}")

    try:
        review_service = get_review_service()

        response = await review_service.get_review_feed(
            statement_id=statement_id,
            organization_id=organization_id
        )

        return response

    except Exception as e:
        logger.error(f"Error getting review feed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/transaction/update", response_model=UpdateTransactionResponse)
async def update_transaction(request: UpdateTransactionRequest):
    """
    THE LEARNING ENGINE

    When user confirms or corrects a category:
    1. Update transaction with user's choice
    2. Generate embedding for description
    3. Insert/update learned_patterns table
    4. Next time similar transaction appears, vector search finds it!
    """

    logger.info(f"Updating transaction {request.transaction_id}")

    try:
        review_service = get_review_service()

        response = await review_service.update_transaction_with_feedback(
            transaction_id=request.transaction_id,
            organization_id=request.organization_id,
            approved_account_code=request.approved_account_code,
            approved_account_name=request.approved_account_name
        )

        return response

    except Exception as e:
        logger.error(f"Error updating transaction: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# XERO INTEGRATION
# ============================================================================

@app.get("/api/xero/connect")
async def xero_connect(organization_id: UUID = Query(...)):
    """
    Step 1: Redirect user to Xero authorization page

    Generate a secure state token and redirect to Xero
    """

    logger.info(f"Initiating Xero connection for org {organization_id}")

    try:
        xero_auth_service = get_xero_auth_service()

        # Generate state for CSRF protection
        state = secrets.token_urlsafe(32)

        # TODO: Store state in session/cache to verify on callback

        authorization_url = xero_auth_service.get_authorization_url(state)

        return RedirectResponse(url=authorization_url)

    except Exception as e:
        logger.error(f"Error initiating Xero connection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/xero/callback")
async def xero_callback(
    code: str = Query(...),
    state: str = Query(...),
    organization_id: UUID = Query(...)
):
    """
    Step 2: Handle OAuth callback from Xero

    Exchange authorization code for access/refresh tokens
    Store encrypted in database
    """

    logger.info(f"Handling Xero callback for org {organization_id}")

    try:
        # TODO: Verify state matches what we sent

        xero_auth_service = get_xero_auth_service()

        result = await xero_auth_service.handle_callback(
            code=code,
            organization_id=organization_id
        )

        if result['success']:
            # Redirect to frontend dashboard
            return RedirectResponse(url=f"/dashboard?xero_connected=true")
        else:
            return RedirectResponse(url=f"/dashboard?xero_error={result['error']}")

    except Exception as e:
        logger.error(f"Error handling Xero callback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/statement/{statement_id}/sync", response_model=XeroSyncResponse)
async def sync_to_xero(
    statement_id: UUID,
    organization_id: UUID = Query(...)
):
    """
    Sync statement to Xero

    CRITICAL PRE-CONDITION:
    ALL transactions must have is_user_verified = True

    If not, returns error: "Please review all items before syncing"
    """

    logger.info(f"Syncing statement {statement_id} to Xero")

    try:
        xero_sync_service = get_xero_sync_service()

        response = await xero_sync_service.sync_statement_to_xero(
            statement_id=statement_id,
            organization_id=organization_id
        )

        return response

    except Exception as e:
        logger.error(f"Error syncing to Xero: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AI PERFORMANCE MONITORING
# ============================================================================

@app.get("/api/analytics/correction-rate")
async def get_correction_rate(
    organization_id: UUID = Query(...),
    days: int = Query(30, ge=1, le=365)
):
    """
    Get AI correction rate over the last N days

    Lower rate = AI is learning and getting better
    """

    logger.info(f"Getting correction rate for org {organization_id}")

    try:
        monitoring_service = get_monitoring_service()

        result = await monitoring_service.get_correction_rate(
            organization_id=organization_id,
            days=days
        )

        return result

    except Exception as e:
        logger.error(f"Error getting correction rate: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/overconfidence")
async def get_overconfidence_analysis(
    organization_id: UUID = Query(...)
):
    """
    Analyze cases where AI was confident but user corrected

    Helps identify:
    - Categories AI struggles with
    - Whether confidence scores need calibration
    """

    logger.info(f"Getting overconfidence analysis for org {organization_id}")

    try:
        monitoring_service = get_monitoring_service()

        result = await monitoring_service.get_overconfidence_analysis(
            organization_id=organization_id
        )

        return result

    except Exception as e:
        logger.error(f"Error getting overconfidence analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analytics/learning-effectiveness")
async def get_learning_effectiveness(
    organization_id: UUID = Query(...)
):
    """
    Measure learning effectiveness

    Shows vector match rate over time
    As system learns, more transactions match patterns vs. needing LLM
    """

    logger.info(f"Getting learning effectiveness for org {organization_id}")

    try:
        monitoring_service = get_monitoring_service()

        result = await monitoring_service.get_learning_effectiveness(
            organization_id=organization_id
        )

        return result

    except Exception as e:
        logger.error(f"Error getting learning effectiveness: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# COMBINED WORKFLOW ENDPOINT
# ============================================================================

@app.post("/api/statement/{statement_id}/process-and-categorize")
async def process_and_categorize(
    statement_id: UUID,
    file_path: str = Query(...),
    organization_id: UUID = Query(...)
):
    """
    Combined endpoint: Process + Categorize in one call

    Useful for streamlined workflows
    """

    logger.info(f"Processing and categorizing statement {statement_id}")

    try:
        # Step 1: Process (Safety Check)
        ingestion_service = get_ingestion_service()
        process_result = await ingestion_service.process_statement(
            statement_id=statement_id,
            file_path=file_path,
            organization_id=organization_id
        )

        if not process_result.reconciliation_result.is_valid:
            # Math check failed, don't proceed to categorization
            return {
                "processing": process_result,
                "categorization": None,
                "message": "Statement failed reconciliation check. Categorization skipped."
            }

        # Step 2: Categorize (AI)
        categorization_service = get_categorization_service()
        categorize_result = await categorization_service.categorize_statement(
            statement_id=statement_id,
            organization_id=organization_id
        )

        return {
            "processing": process_result,
            "categorization": categorize_result,
            "message": "Statement processed and categorized successfully"
        }

    except Exception as e:
        logger.error(f"Error in combined workflow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ERROR HANDLERS
# ============================================================================

@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    logger.error(f"HTTP exception: {exc.detail}")
    return {
        "error": exc.detail,
        "status_code": exc.status_code
    }


@app.exception_handler(Exception)
async def general_exception_handler(request, exc):
    logger.error(f"Unhandled exception: {exc}")
    return {
        "error": "Internal server error",
        "detail": str(exc)
    }


# ============================================================================
# STARTUP/SHUTDOWN
# ============================================================================

@app.on_event("startup")
async def startup_event():
    logger.info("AI Bookkeeping Backend starting up...")
    logger.info(f"Environment: {settings.environment}")
    logger.info("All services initialized")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("AI Bookkeeping Backend shutting down...")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.debug,
        log_level=settings.log_level.lower()
    )
