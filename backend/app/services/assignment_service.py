"""
Agent Assignment Service
Automatically assigns qualified leads to available sales agents.
Assignment logic:
  1. Filter active agents who haven't hit their max_leads cap
  2. Prefer agents whose areas_covered matches the lead's location
  3. Among matching agents, pick the one with fewest active leads (load balancing)
  4. Notify the assigned agent via WhatsApp
"""
from datetime import datetime
from typing import Optional
from sqlalchemy.orm import Session
from app.models.lead import Lead, LeadStatus
from app.models.agent import Agent
from app.services.whatsapp_service import send_whatsapp_message


def find_best_agent(lead: Lead, db: Session) -> Optional[Agent]:
    """
    Find the most suitable available agent for a lead.
    """
    agents = db.query(Agent).filter(Agent.is_active == True).all()
    if not agents:
        return None

    # Count active leads per agent
    def active_leads(agent: Agent) -> int:
        return sum(
            1 for l in agent.leads
            if l.status not in ["converted", "lost"]
        )

    # Filter agents under their cap
    available = [a for a in agents if active_leads(a) < a.max_leads]
    if not available:
        return None

    # Prefer agents whose areas match the lead's location
    if lead.location_preference:
        location_lower = lead.location_preference.lower()
        location_matched = [
            a for a in available
            if a.areas_covered and location_lower in a.areas_covered.lower()
        ]
        if location_matched:
            available = location_matched

    # Pick agent with fewest active leads (load balancing)
    return min(available, key=lambda a: active_leads(a))


async def assign_lead_to_agent(lead: Lead, db: Session, agent: Agent = None) -> Lead:
    """
    Assign a lead to an agent and notify both parties.
    If agent is None, auto-selects the best agent.
    """
    if agent is None:
        agent = find_best_agent(lead, db)

    if agent is None:
        return lead  # No available agent, skip assignment

    lead.assigned_agent_id = agent.id
    lead.assigned_at = datetime.utcnow()
    lead.status = LeadStatus.ASSIGNED
    agent.total_leads_assigned += 1
    db.commit()
    db.refresh(lead)

    # Notify agent via WhatsApp
    await notify_agent(agent, lead)

    return lead


async def notify_agent(agent: Agent, lead: Lead):
    """Send a WhatsApp notification to the assigned agent."""
    if not agent.whatsapp_number:
        return

    score_emoji = {
        "hot": "🔥 HOT",
        "warm": "🌡️ WARM",
        "cold": "❄️ COLD",
        "unqualified": "⚪ UNQUALIFIED",
    }.get(lead.score, lead.score)

    budget_display = "Not specified"
    if lead.budget_max:
        if lead.budget_max >= 10000000:
            budget_display = f"₹{lead.budget_max/10000000:.1f} Cr"
        else:
            budget_display = f"₹{lead.budget_max/100000:.0f} L"

    message = (
        f"🏠 *New Lead Assigned to You!*\n\n"
        f"👤 *Name:* {lead.name}\n"
        f"📱 *Phone:* {lead.phone}\n"
        f"📧 *Email:* {lead.email or 'N/A'}\n\n"
        f"📊 *Lead Score:* {score_emoji} ({lead.score_value}/100)\n\n"
        f"🏡 *Requirements:*\n"
        f"  • Property: {lead.property_type or 'N/A'}\n"
        f"  • BHK: {lead.bhk_preference or 'N/A'}\n"
        f"  • Location: {lead.location_preference or 'N/A'}\n"
        f"  • Budget: {budget_display}\n"
        f"  • Timeline: {lead.purchase_timeline or 'N/A'}\n"
        f"  • Purpose: {lead.purpose or 'N/A'}\n\n"
        f"📅 *Source:* {lead.source}\n"
        f"🕐 *Lead Created:* {lead.created_at.strftime('%d %b %Y, %I:%M %p')}\n\n"
        f"Please follow up with this lead at the earliest! 🚀"
    )

    await send_whatsapp_message(agent.whatsapp_number, message)


async def auto_assign_qualified_leads(db: Session):
    """
    Batch job: find all qualified-but-unassigned leads and assign them.
    Called by the scheduler every few minutes.
    """
    unassigned = (
        db.query(Lead)
        .filter(Lead.status == LeadStatus.QUALIFIED, Lead.assigned_agent_id == None)
        .all()
    )
    results = []
    for lead in unassigned:
        updated = await assign_lead_to_agent(lead, db)
        results.append({
            "lead_id": lead.id,
            "lead_name": lead.name,
            "assigned_to": updated.agent.name if updated.agent else None,
        })
    return results
