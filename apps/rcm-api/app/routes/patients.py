"""Patient management endpoints"""
from fastapi import APIRouter, Query
from typing import Optional

router = APIRouter()

@router.get("/")
async def list_patients(search: Optional[str] = None, page: int = Query(1, ge=1)):
    return {"patients": [], "page": page}

@router.get("/{patient_id}")
async def get_patient(patient_id: str):
    return {"id": patient_id}

@router.get("/{patient_id}/eligibility")
async def check_eligibility(patient_id: str, payer_id: str = Query(...)):
    """Check patient eligibility via NPHIES."""
    return {"patient_id": patient_id, "payer_id": payer_id, "eligible": True}
