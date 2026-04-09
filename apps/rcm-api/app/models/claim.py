"""Claim data models"""
from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime

class ClaimStatus(str, Enum):
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    APPEALED = "appealed"
    PAID = "paid"

class DiagnosisItem(BaseModel):
    sequence: int
    icd10_code: str
    description: Optional[str] = None

class ProcedureItem(BaseModel):
    sequence: int
    cpt_code: str
    unit_price: float
    quantity: int = 1

class ClaimCreate(BaseModel):
    patient_id: str
    provider_id: str
    payer_id: str
    service_date: datetime
    diagnosis: List[DiagnosisItem]
    procedures: List[ProcedureItem]
    notes: Optional[str] = None

class ClaimResponse(BaseModel):
    id: str
    patient_id: str
    provider_id: str
    status: ClaimStatus = ClaimStatus.DRAFT
    total_amount: float = 0.0
    risk_score: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
