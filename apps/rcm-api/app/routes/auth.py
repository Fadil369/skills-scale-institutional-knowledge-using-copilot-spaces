"""Authentication endpoints — JWT-based"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
import os, time, hmac, hashlib, json, base64

router = APIRouter()
JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

@router.post("/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    if form.username == "demo" and form.password == "demo":
        token = _sign_jwt({"sub": form.username, "role": "analyst"}, JWT_SECRET)
        return Token(access_token=token)
    raise HTTPException(status_code=401, detail="Invalid credentials")

def _sign_jwt(payload: dict, secret: str, expires_in: int = 3600) -> str:
    header = base64.urlsafe_b64encode(b'{"alg":"HS256","typ":"JWT"}').rstrip(b'=').decode()
    now = int(time.time())
    p = {**payload, "iat": now, "exp": now + expires_in}
    body = base64.urlsafe_b64encode(json.dumps(p).encode()).rstrip(b'=').decode()
    sig = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
    return f"{header}.{body}.{base64.urlsafe_b64encode(sig).rstrip(b'=').decode()}"
