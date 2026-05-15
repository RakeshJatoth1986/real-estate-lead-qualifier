"""
Agent Routes
- POST /agents/           : Create agent
- GET  /agents/           : List all agents
- GET  /agents/{id}       : Get agent detail + their leads
- PUT  /agents/{id}       : Update agent
- DELETE /agents/{id}     : Deactivate agent
- GET  /agents/{id}/leads : Get leads assigned to agent
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.models.database import get_db
from app.models.agent import Agent
from app.models.lead import Lead

router = APIRouter(prefix="/agents", tags=["Agents"])


def full_lead_dict(l) -> dict:
    return {
        "id": l.id,
        "name": l.name,
        "phone": l.phone,
        "email": l.email,
        "source": l.source,
        "score": l.score,
        "score_value": l.score_value,
        "status": l.status,
        "property_type": l.property_type,
        "bhk_preference": l.bhk_preference,
        "location_preference": l.location_preference,
        "budget_min": l.budget_min,
        "budget_max": l.budget_max,
        "purchase_timeline": l.purchase_timeline,
        "purpose": l.purpose,
        "follow_up_status": l.follow_up_status,
        "expected_conversion_date": l.expected_conversion_date.isoformat() if l.expected_conversion_date else None,
        "agent_notes": l.agent_notes,
        "notes": l.notes,
        "wa_conversation_step": l.wa_conversation_step,
        "wa_last_message_at": l.wa_last_message_at.isoformat() if l.wa_last_message_at else None,
        "assigned_at": l.assigned_at.isoformat() if l.assigned_at else None,
        "created_at": l.created_at.isoformat(),
        "updated_at": l.updated_at.isoformat() if l.updated_at else None,
    }


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    phone: str
    email: Optional[str] = None
    whatsapp_number: Optional[str] = None
    specialization: Optional[str] = None
    areas_covered: Optional[str] = None
    max_leads: Optional[int] = 20


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    whatsapp_number: Optional[str] = None
    specialization: Optional[str] = None
    areas_covered: Optional[str] = None
    max_leads: Optional[int] = None
    is_active: Optional[bool] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def agent_to_dict(agent: Agent, include_leads: bool = False) -> dict:
    active_leads = sum(
        1 for l in agent.leads if l.status not in ["converted", "lost"]
    )
    result = {
        "id": agent.id,
        "name": agent.name,
        "phone": agent.phone,
        "email": agent.email,
        "whatsapp_number": agent.whatsapp_number,
        "specialization": agent.specialization,
        "areas_covered": agent.areas_covered,
        "is_active": agent.is_active,
        "max_leads": agent.max_leads,
        "active_lead_count": active_leads,
        "total_leads_assigned": agent.total_leads_assigned,
        "total_converted": agent.total_converted,
        "conversion_rate": round(
            (agent.total_converted / agent.total_leads_assigned * 100)
            if agent.total_leads_assigned > 0 else 0, 1
        ),
        "created_at": agent.created_at.isoformat(),
    }
    if include_leads:
        result["leads"] = [
            {
                "id": l.id,
                "name": l.name,
                "phone": l.phone,
                "score": l.score,
                "score_value": l.score_value,
                "status": l.status,
                "property_type": l.property_type,
                "location_preference": l.location_preference,
                "created_at": l.created_at.isoformat(),
            }
            for l in sorted(agent.leads, key=lambda x: x.created_at, reverse=True)
        ]
    return result


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/")
def create_agent(payload: AgentCreate, db: Session = Depends(get_db)):
    existing = db.query(Agent).filter(Agent.phone == payload.phone).first()
    if existing:
        raise HTTPException(status_code=400, detail="Agent with this phone already exists")
    agent = Agent(**payload.model_dump())
    db.add(agent)
    db.commit()
    db.refresh(agent)
    return agent_to_dict(agent)


@router.get("/")
def list_agents(
    active_only: bool = True,
    db: Session = Depends(get_db),
):
    query = db.query(Agent)
    if active_only:
        query = query.filter(Agent.is_active == True)
    agents = query.order_by(Agent.name).all()
    return [agent_to_dict(a) for a in agents]


@router.get("/{agent_id}")
def get_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent_to_dict(agent, include_leads=True)


@router.put("/{agent_id}")
def update_agent(agent_id: int, payload: AgentUpdate, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(agent, field, value)
    db.commit()
    db.refresh(agent)
    return agent_to_dict(agent)


@router.delete("/{agent_id}")
def deactivate_agent(agent_id: int, db: Session = Depends(get_db)):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.is_active = False
    db.commit()
    return {"status": "deactivated", "agent_id": agent_id}


@router.get("/{agent_id}/leads")
def get_agent_leads(
    agent_id: int,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    leads = agent.leads
    if status:
        leads = [l for l in leads if l.status == status]
    return [
        {
            "id": l.id,
            "name": l.name,
            "phone": l.phone,
            "score": l.score,
            "score_value": l.score_value,
            "status": l.status,
            "property_type": l.property_type,
            "location_preference": l.location_preference,
            "budget_max": l.budget_max,
            "purchase_timeline": l.purchase_timeline,
            "created_at": l.created_at.isoformat(),
        }
        for l in sorted(leads, key=lambda x: x.score_value, reverse=True)
    ]


@router.get("/me/leads")
def get_my_leads(
    authorization: str = __import__('fastapi').Header(...),
    db: Session = Depends(get_db),
):
    from app.routes.auth import decode_token
    token = authorization.replace("Bearer ", "").strip()
    agent_id = decode_token(token)
    if not agent_id:
        raise __import__('fastapi').HTTPException(status_code=401, detail="Invalid token")
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise __import__('fastapi').HTTPException(status_code=401, detail="Agent not found")
    leads = sorted(agent.leads, key=lambda x: (x.score_value or 0), reverse=True)
    return {
        "agent": {"id": agent.id, "name": agent.name, "phone": agent.phone, "specialization": agent.specialization},
        "leads": [full_lead_dict(l) for l in leads],
    }
