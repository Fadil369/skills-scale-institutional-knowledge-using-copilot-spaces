"""Claims management endpoints"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from app.models.claim import ClaimCreate, ClaimResponse, ClaimStatus
from app.services.fraud_detection import FraudDetectionService

router = APIRouter()
fraud_service = FraudDetectionService()

@router.get("/", response_model=List[ClaimResponse])
async def list_claims(
    status: Optional[ClaimStatus] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List claims with optional status filter and pagination."""
    return []  # Replace with DB query

@router.post("/", response_model=ClaimResponse, status_code=201)
async def create_claim(claim: ClaimCreate):
    """Submit a new insurance claim."""
    risk = fraud_service.score(claim.dict())
    return {"id": "new", **claim.dict(), "risk_score": risk}

@router.get("/{claim_id}", response_model=ClaimResponse)
async def get_claim(claim_id: str):
    """Get a specific claim by ID."""
    raise HTTPException(status_code=404, detail=f"Claim {claim_id} not found")

@router.post("/{claim_id}/appeal")
async def appeal_claim(claim_id: str):
    """Submit an appeal for a rejected claim."""
    return {"claim_id": claim_id, "appeal_status": "submitted"}
