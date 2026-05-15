"""
Lead Routes
- POST /leads/ingest          : Receive lead from Google Form (via Apps Script webhook)
- GET  /leads/                : List all leads (with filters)
- GET  /leads/{id}            : Get single lead detail
- PUT  /leads/{id}            : Update lead manually
- POST /leads/{id}/assign     : Manually assign lead to agent
- POST /leads/{id}/qualify    : Re-run qualification scoring
- GET  /leads/{id}/messages   : Get WhatsApp conversation history
"""
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.models.database import get_db
from app.models.lead import Lead, LeadStatus, LeadScore, LeadSource
from app.models.agent import Agent
from app.services.whatsapp_service import initiate_conversation, send_whatsapp_message
from app.services.qualification_service import qualify_lead, get_score_summary
from app.services.assignment_service import assign_lead_to_agent

router = APIRouter(prefix="/leads", tags=["Leads"])


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class GoogleFormPayload(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    source: Optional[str] = LeadSource.GOOGLE_FORM
    secret: Optional[str] = None
    # Optional pre-filled fields
    property_type: Optional[str] = None
    location_preference: Optional[str] = None
    budget: Optional[str] = None
    notes: Optional[str] = None


class LeadUpdatePayload(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    property_type: Optional[str] = None
    bhk_preference: Optional[str] = None
    location_preference: Optional[str] = None
    budget_min: Optional[float] = None
    budget_max: Optional[float] = None
    purchase_timeline: Optional[str] = None
    purpose: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    follow_up_status: Optional[str] = None
    expected_conversion_date: Optional[str] = None
    agent_notes: Optional[str] = None


class AssignPayload(BaseModel):
    agent_id: int


class SendMessagePayload(BaseModel):
    message: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def lead_to_dict(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "name": lead.name,
        "phone": lead.phone,
        "email": lead.email,
        "source": lead.source,
        "property_type": lead.property_type,
        "bhk_preference": lead.bhk_preference,
        "location_preference": lead.location_preference,
        "budget_min": lead.budget_min,
        "budget_max": lead.budget_max,
        "purchase_timeline": lead.purchase_timeline,
        "purpose": lead.purpose,
        "score": lead.score,
        "score_value": lead.score_value,
        "status": lead.status,
        "wa_conversation_step": lead.wa_conversation_step,
        "assigned_agent_id": lead.assigned_agent_id,
        "assigned_agent_name": lead.agent.name if lead.agent else None,
        "assigned_at": lead.assigned_at.isoformat() if lead.assigned_at else None,
        "agent_handling": lead.agent_handling,
        "notes": lead.notes,
        "follow_up_status": lead.follow_up_status,
        "expected_conversion_date": lead.expected_conversion_date.isoformat() if lead.expected_conversion_date else None,
        "agent_notes": lead.agent_notes,
        "created_at": lead.created_at.isoformat(),
        "updated_at": lead.updated_at.isoformat() if lead.updated_at else None,
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/ingest")
async def ingest_lead(
    payload: GoogleFormPayload,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Receive a new lead from Google Form (via Apps Script webhook).
    Automatically:
      1. Saves the lead to DB
      2. Initiates WhatsApp conversation
      3. Runs qualification (partial) and assignment
    """
    # Normalize phone: ensure +countrycode format
    phone = payload.phone.strip().replace(" ", "").replace("-", "")
    if not phone.startswith("+"):
        if phone.startswith("91") and len(phone) == 12:
            phone = f"+{phone}"
        elif len(phone) == 10:
            phone = f"+91{phone}"
        else:
            phone = f"+{phone}"

    # Deduplicate by phone
    existing = db.query(Lead).filter(Lead.phone == phone).first()
    if existing:
        return {"status": "duplicate", "lead_id": existing.id, "message": "Lead already exists"}

    lead = Lead(
        name=payload.name,
        phone=phone,
        email=payload.email,
        source=payload.source or LeadSource.GOOGLE_FORM,
        property_type=payload.property_type,
        location_preference=payload.location_preference,
        notes=payload.notes,
        raw_form_data=json.dumps(payload.model_dump()),
        status=LeadStatus.NEW,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    # Kick off WhatsApp conversation in background (use fresh DB session)
    from app.models.database import SessionLocal
    async def start_conversation_fresh(lead_id: int):
        fresh_db = SessionLocal()
        try:
            fresh_lead = fresh_db.query(Lead).filter(Lead.id == lead_id).first()
            if fresh_lead:
                await initiate_conversation(fresh_lead, fresh_db)
        finally:
            fresh_db.close()
    background_tasks.add_task(start_conversation_fresh, lead.id)

    return {
        "status": "created",
        "lead_id": lead.id,
        "message": f"Lead created. WhatsApp conversation initiated with {lead.phone}",
    }


@router.get("/")
def list_leads(
    status: Optional[str] = Query(None),
    score: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    agent_id: Optional[int] = Query(None),
    follow_up_status: Optional[str] = Query(None),
    budget_min: Optional[float] = Query(None),
    budget_max: Optional[float] = Query(None),
    location: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    """List leads with optional filters."""
    query = db.query(Lead)
    if status:
        query = query.filter(Lead.status == status)
    if score:
        query = query.filter(Lead.score == score)
    if source:
        query = query.filter(Lead.source == source)
    if agent_id:
        query = query.filter(Lead.assigned_agent_id == agent_id)
    if follow_up_status:
        query = query.filter(Lead.follow_up_status == follow_up_status)
    if budget_min is not None:
        query = query.filter(Lead.budget_max >= budget_min)
    if budget_max is not None:
        query = query.filter(Lead.budget_min <= budget_max)
    if location:
        query = query.filter(Lead.location_preference.ilike(f"%{location}%"))
    if search:
        query = query.filter(
            Lead.name.ilike(f"%{search}%") | Lead.phone.ilike(f"%{search}%")
        )
    total = query.count()
    leads = query.order_by(Lead.created_at.desc()).offset(skip).limit(limit).all()
    return {
        "total": total,
        "leads": [lead_to_dict(l) for l in leads],
    }


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Dashboard summary statistics."""
    total = db.query(Lead).count()
    by_status = {}
    for s in LeadStatus:
        by_status[s.value] = db.query(Lead).filter(Lead.status == s.value).count()
    by_score = {}
    for s in LeadScore:
        by_score[s.value] = db.query(Lead).filter(Lead.score == s.value).count()
    return {
        "total_leads": total,
        "by_status": by_status,
        "by_score": by_score,
    }


@router.get("/{lead_id}")
def get_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    result = lead_to_dict(lead)
    result["score_summary"] = get_score_summary(lead)
    return result


@router.put("/{lead_id}")
def update_lead(lead_id: int, payload: LeadUpdatePayload, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    data = payload.model_dump(exclude_none=True)
    if "expected_conversion_date" in data:
        from datetime import datetime as dt
        try:
            data["expected_conversion_date"] = dt.fromisoformat(data["expected_conversion_date"])
        except Exception:
            data.pop("expected_conversion_date")
    for field, value in data.items():
        setattr(lead, field, value)
    lead.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(lead)
    return lead_to_dict(lead)


@router.delete("/{lead_id}")
def delete_lead(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    # Delete associated messages first
    for msg in lead.messages:
        db.delete(msg)
    db.delete(lead)
    db.commit()
    return {"status": "deleted", "lead_id": lead_id}


@router.post("/{lead_id}/qualify")
def run_qualification(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    lead = qualify_lead(lead, db)
    return {"lead_id": lead.id, "score": lead.score_value, "label": lead.score}


@router.post("/{lead_id}/assign")
async def assign_lead(lead_id: int, payload: AssignPayload, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    agent = db.query(Agent).filter(Agent.id == payload.agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    lead = await assign_lead_to_agent(lead, db, agent)
    return {"status": "assigned", "lead_id": lead.id, "agent": agent.name}


@router.post("/{lead_id}/send-message")
async def send_message(
    lead_id: int,
    payload: SendMessagePayload,
    authorization: str = __import__('fastapi').Header(...),
    db: Session = Depends(get_db),
):
    """Agent sends a WhatsApp message to the lead. Activates agent_handling mode."""
    from app.routes.auth import decode_token
    token = authorization.replace("Bearer ", "").strip()
    agent_id = decode_token(token)
    if not agent_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    result = await send_whatsapp_message(lead.phone, message)

    # Check for WhatsApp API errors (e.g. 24-hour window expired)
    if "error" in result:
        err = result["error"]
        code = err.get("code")
        if code == 131047:
            raise HTTPException(
                status_code=400,
                detail="24-hour window expired. The customer must message first to reopen the conversation."
            )
        raise HTTPException(status_code=400, detail=err.get("message", "WhatsApp send failed"))

    wa_id = result.get("messages", [{}])[0].get("id")
    from app.services.whatsapp_service import save_message
    save_message(db, lead.id, "outbound", message, wa_id)

    # Mark agent as handling — bot stops auto-responding
    lead.agent_handling = True
    lead.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "sent", "wa_id": wa_id}


@router.post("/{lead_id}/return-to-bot")
def return_to_bot(
    lead_id: int,
    authorization: str = __import__('fastapi').Header(...),
    db: Session = Depends(get_db),
):
    """Hand the conversation back to the bot."""
    from app.routes.auth import decode_token
    token = authorization.replace("Bearer ", "").strip()
    if not decode_token(token):
        raise HTTPException(status_code=401, detail="Invalid token")

    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    lead.agent_handling = False
    lead.updated_at = datetime.utcnow()
    db.commit()
    return {"status": "returned_to_bot", "lead_id": lead_id}


@router.get("/{lead_id}/messages")
def get_messages(lead_id: int, db: Session = Depends(get_db)):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return [
        {
            "id": m.id,
            "direction": m.direction,
            "text": m.message_text,
            "timestamp": m.timestamp.isoformat(),
        }
        for m in sorted(lead.messages, key=lambda x: x.timestamp)
    ]
