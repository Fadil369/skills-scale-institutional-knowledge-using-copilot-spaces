"""
BrainSAIT RCM API — FastAPI backend
Migrated from Fadil369/brainsait-rcm into the solutions monorepo.
Run: uvicorn main:app --reload
"""
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from app.routes import claims, patients, analytics, compliance, auth
import uvicorn

app = FastAPI(
    title="BrainSAIT RCM API",
    description="AI-Powered Healthcare Claims Management — NPHIES/FHIR R4",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://fadil369.github.io", "https://brainsait.io", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,       prefix="/auth",       tags=["Authentication"])
app.include_router(claims.router,     prefix="/claims",     tags=["Claims"])
app.include_router(patients.router,   prefix="/patients",   tags=["Patients"])
app.include_router(analytics.router,  prefix="/analytics",  tags=["Analytics"])
app.include_router(compliance.router, prefix="/compliance", tags=["Compliance"])

@app.get("/health")
async def health():
    return {"status": "ok", "service": "brainsait-rcm-api", "version": "2.0.0"}

@app.get("/")
async def root():
    return {"message": "BrainSAIT RCM API — visit /docs for the API reference"}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
