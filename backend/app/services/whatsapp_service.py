"""
WhatsApp Cloud API Service
Handles sending messages and managing conversation flows with leads.
"""
import httpx
import json
from datetime import datetime
from sqlalchemy.orm import Session
from app.config import settings
from app.models.lead import Lead, WhatsAppMessage, LeadStatus


def get_whatsapp_api_url() -> str:
    """Build WhatsApp API URL dynamically to always use current settings."""
    return (
        f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}"
        f"/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    )

# ─────────────────────────────────────────────
# Conversation flow definition
# Each step: question to ask, field to populate
# ─────────────────────────────────────────────
CONVERSATION_FLOW = [
    {
        "step": 0,
        "field": None,
        "message": (
            "👋 Hi {name}! Thank you for your interest in our properties.\n\n"
            "I'm your virtual property assistant. I'll ask you a few quick questions "
            "to help find the perfect property for you.\n\n"
            "Let's start! 🏠\n\n"
            "*What type of property are you looking for?*\n"
            "Reply with a number:\n"
            "1️⃣ Apartment\n"
            "2️⃣ Villa / Independent House\n"
            "3️⃣ Plot / Land\n"
            "4️⃣ Commercial Space"
        ),
    },
    {
        "step": 1,
        "field": "property_type",
        "message": (
            "Great choice! 👍\n\n"
            "*How many BHK are you looking for?*\n"
            "Reply with a number:\n"
            "1️⃣ 1 BHK\n"
            "2️⃣ 2 BHK\n"
            "3️⃣ 3 BHK\n"
            "4️⃣ 4 BHK or more\n"
            "5️⃣ Not applicable (Plot/Commercial)"
        ),
    },
    {
        "step": 2,
        "field": "bhk_preference",
        "message": (
            "Perfect! 🏡\n\n"
            "*What is your preferred location / area?*\n"
            "Please type the area name (e.g., Whitefield, Bandra, Gurgaon Sector 56)"
        ),
    },
    {
        "step": 3,
        "field": "location_preference",
        "message": (
            "Got it! 📍\n\n"
            "*What is your budget range?*\n"
            "Reply with a number:\n"
            "1️⃣ Below ₹50 Lakhs\n"
            "2️⃣ ₹50L – ₹1 Crore\n"
            "3️⃣ ₹1 Crore – ₹2 Crore\n"
            "4️⃣ ₹2 Crore – ₹5 Crore\n"
            "5️⃣ Above ₹5 Crore"
        ),
    },
    {
        "step": 4,
        "field": "budget_max",
        "message": (
            "Noted! 💰\n\n"
            "*When are you planning to purchase?*\n"
            "Reply with a number:\n"
            "1️⃣ Immediately (within 1 month)\n"
            "2️⃣ Within 3 months\n"
            "3️⃣ Within 6 months\n"
            "4️⃣ Within 1 year\n"
            "5️⃣ Just exploring"
        ),
    },
    {
        "step": 5,
        "field": "purchase_timeline",
        "message": (
            "Almost done! 🎯\n\n"
            "*What is the purpose of purchase?*\n"
            "Reply with a number:\n"
            "1️⃣ Self Use / End Use\n"
            "2️⃣ Investment\n"
            "3️⃣ Both"
        ),
    },
    {
        "step": 6,
        "field": "purpose",
        "message": (
            "Thank you, {name}! 🙏\n\n"
            "We've received all your requirements. Our team will review your profile "
            "and one of our expert agents will reach out to you shortly with the best options.\n\n"
            "📞 Expect a call/WhatsApp from us within *24 hours*.\n\n"
            "Have a great day! 😊"
        ),
    },
]

# Mapping for option selections
PROPERTY_TYPE_MAP = {
    "1": "Apartment", "2": "Villa", "3": "Plot", "4": "Commercial"
}
BHK_MAP = {
    "1": "1 BHK", "2": "2 BHK", "3": "3 BHK", "4": "4+ BHK", "5": "N/A"
}
BUDGET_MAP = {
    "1": (0, 5000000),
    "2": (5000000, 10000000),
    "3": (10000000, 20000000),
    "4": (20000000, 50000000),
    "5": (50000000, 999999999),
}
TIMELINE_MAP = {
    "1": "immediate", "2": "3_months", "3": "6_months", "4": "1_year", "5": "exploring"
}
PURPOSE_MAP = {
    "1": "self_use", "2": "investment", "3": "both"
}


async def send_whatsapp_message(phone: str, message: str) -> dict:
    """Send a text message via WhatsApp Cloud API."""
    # Strip whitespace/newlines from token (Railway sometimes adds trailing \n)
    token = settings.WHATSAPP_ACCESS_TOKEN.strip()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "text",
        "text": {"body": message},
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(get_whatsapp_api_url(), headers=headers, json=payload)
        return response.json()


async def send_whatsapp_template(to: str, template_name: str, parameters: list) -> dict:
    """Send an approved WhatsApp template message."""
    token = settings.WHATSAPP_ACCESS_TOKEN.strip()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": "en"},
            "components": [{
                "type": "body",
                "parameters": [
                    {"type": "text", "text": str(p)} for p in parameters
                ]
            }]
        }
    }
    async with httpx.AsyncClient() as client:
        response = await client.post(get_whatsapp_api_url(), headers=headers, json=payload)
        return response.json()


def save_message(db: Session, lead_id: int, direction: str, text: str, wa_id: str = None):
    """Persist a WhatsApp message to the database."""
    msg = WhatsAppMessage(
        lead_id=lead_id,
        direction=direction,
        message_text=text,
        wa_message_id=wa_id,
        timestamp=datetime.utcnow(),
    )
    db.add(msg)
    db.commit()


async def initiate_conversation(lead: Lead, db: Session):
    """Send the first WhatsApp message to a new lead."""
    # Don't re-initiate if already started
    if lead.wa_conversation_step > 0:
        return {"status": "already_started"}
    step_data = CONVERSATION_FLOW[0]
    message = step_data["message"].format(name=lead.name)
    result = await send_whatsapp_message(lead.phone, message)
    wa_id = result.get("messages", [{}])[0].get("id")
    save_message(db, lead.id, "outbound", message, wa_id)
    lead.status = LeadStatus.CONTACTED
    lead.wa_conversation_step = 1  # Next expected reply maps to step 1
    lead.wa_last_message_at = datetime.utcnow()
    db.commit()
    return result


async def handle_incoming_message(phone: str, message_text: str, wa_message_id: str, db: Session):
    """
    Process an incoming WhatsApp reply from a lead.
    Advances the conversation flow and updates lead data.
    """
    # Normalize: Meta sends numbers without '+', DB stores them with '+'
    normalized_phone = phone if phone.startswith("+") else f"+{phone}"
    lead = db.query(Lead).filter(Lead.phone == normalized_phone).order_by(Lead.created_at.desc()).first()
    if not lead:
        return {"status": "unknown_lead"}

    # Save inbound message
    save_message(db, lead.id, "inbound", message_text, wa_message_id)

    step = lead.wa_conversation_step
    text = message_text.strip()

    # Parse and store the answer from the previous question
    if step == 1:
        lead.property_type = PROPERTY_TYPE_MAP.get(text, text)
    elif step == 2:
        lead.bhk_preference = BHK_MAP.get(text, text)
    elif step == 3:
        lead.location_preference = text
    elif step == 4:
        budget = BUDGET_MAP.get(text)
        if budget:
            lead.budget_min, lead.budget_max = budget
    elif step == 5:
        lead.purchase_timeline = TIMELINE_MAP.get(text, text)
    elif step == 6:
        lead.purpose = PURPOSE_MAP.get(text, text)

    # next_step is the index of the next question to send
    next_step = step + 1 if step < len(CONVERSATION_FLOW) else step

    if next_step < len(CONVERSATION_FLOW):
        next_msg_data = CONVERSATION_FLOW[next_step]
        reply = next_msg_data["message"].format(name=lead.name)
        result = await send_whatsapp_message(phone, reply)
        wa_id = result.get("messages", [{}])[0].get("id")
        save_message(db, lead.id, "outbound", reply, wa_id)
        # wa_conversation_step = next_step means "we just sent question next_step,
        # so the next reply should be processed as step next_step"
        lead.wa_conversation_step = next_step
        lead.wa_last_message_at = datetime.utcnow()

        # If this was the last question (step 6 = thank you message), mark qualified
        if next_step == len(CONVERSATION_FLOW) - 1:
            lead.status = LeadStatus.QUALIFIED

    db.commit()
    return {"status": "ok", "step": next_step}
