"""
Auth Routes
- POST /auth/login      : Agent login with phone + PIN → JWT
- GET  /auth/me         : Validate token, return agent info
- POST /auth/set-pin    : Admin sets PIN for an agent
"""
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from jose import JWTError, jwt
from passlib.context import CryptContext

from app.models.database import get_db
from app.models.agent import Agent
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Auth"])

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"
TOKEN_EXPIRE_DAYS = 30


# ── Schemas ───────────────────────────────────────────────────────────────────

class LoginPayload(BaseModel):
    phone: str
    pin: str


class SetPinPayload(BaseModel):
    agent_id: int
    pin: str  # plain PIN sent by admin UI, stored hashed


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_token(agent_id: int) -> str:
    expire = datetime.utcnow() + timedelta(days=TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": str(agent_id), "exp": expire}, settings.APP_SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[int]:
    try:
        payload = jwt.decode(token, settings.APP_SECRET_KEY, algorithms=[ALGORITHM])
        return int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        return None


def get_current_agent(authorization: str = Header(...), db: Session = Depends(get_db)) -> Agent:
    token = authorization.replace("Bearer ", "").strip()
    agent_id = decode_token(token)
    if not agent_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=401, detail="Agent not found")
    return agent


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    phone = payload.phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        phone = f"+91{phone}" if len(phone) == 10 else f"+{phone}"

    agent = db.query(Agent).filter(Agent.phone == phone).first()
    if not agent:
        raise HTTPException(status_code=401, detail="Phone number not registered")
    if not agent.hashed_pin:
        raise HTTPException(status_code=401, detail="PIN not set — contact your admin")
    if not pwd_context.verify(payload.pin, agent.hashed_pin):
        raise HTTPException(status_code=401, detail="Incorrect PIN")
    if not agent.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    token = create_token(agent.id)
    return {
        "token": token,
        "agent_id": agent.id,
        "name": agent.name,
        "phone": agent.phone,
        "specialization": agent.specialization,
        "areas_covered": agent.areas_covered,
    }


@router.get("/me")
def me(agent: Agent = Depends(get_current_agent)):
    return {
        "agent_id": agent.id,
        "name": agent.name,
        "phone": agent.phone,
        "specialization": agent.specialization,
        "areas_covered": agent.areas_covered,
        "is_active": agent.is_active,
    }


@router.post("/set-pin")
def set_pin(payload: SetPinPayload, db: Session = Depends(get_db)):
    if len(payload.pin) < 4:
        raise HTTPException(status_code=400, detail="PIN must be at least 4 digits")
    agent = db.query(Agent).filter(Agent.id == payload.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.hashed_pin = pwd_context.hash(payload.pin)
    agent.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "ok", "message": f"PIN set for {agent.name}"}
