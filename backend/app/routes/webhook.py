"""
WhatsApp Webhook Routes
- GET  /webhook/whatsapp  : Meta webhook verification (challenge)
- POST /webhook/whatsapp  : Receive incoming WhatsApp messages from leads
"""
import json
from fastapi import APIRouter, Request, Query, HTTPException, Depends
from sqlalchemy.orm import Session

from app.config import settings
from app.models.database import get_db
from app.services.whatsapp_service import handle_incoming_message
from app.services.qualification_service import qualify_lead
from app.services.assignment_service import assign_lead_to_agent
from app.models.lead import Lead, LeadStatus

router = APIRouter(prefix="/webhook", tags=["Webhook"])


@router.get("/whatsapp")
async def verify_webhook(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """
    Meta webhook verification endpoint.
    Meta sends a GET request with hub.challenge — we must echo it back
    if the verify token matches.
    """
    if hub_mode == "subscribe" and hub_verify_token == settings.WHATSAPP_VERIFY_TOKEN:
        # Return challenge as plain text (Meta expects the exact string back)
        from fastapi.responses import PlainTextResponse
        return PlainTextResponse(content=hub_challenge)
    raise HTTPException(status_code=403, detail="Verification failed")


@router.post("/whatsapp")
async def receive_whatsapp(request: Request, db: Session = Depends(get_db)):
    """
    Receive incoming WhatsApp messages from Meta Cloud API.
    Processes the message, advances conversation, qualifies and assigns lead.
    """
    body = await request.json()

    try:
        # Navigate Meta's webhook payload structure
        entry = body.get("entry", [{}])[0]
        changes = entry.get("changes", [{}])[0]
        value = changes.get("value", {})
        messages = value.get("messages", [])

        if not messages:
            # Could be a status update (delivered/read) — ignore
            return {"status": "ok"}

        msg = messages[0]
        phone = msg.get("from")          # sender's phone number
        wa_message_id = msg.get("id")
        msg_type = msg.get("type", "text")

        if msg_type == "text":
            text = msg.get("text", {}).get("body", "").strip()
        elif msg_type == "interactive":
            # Handle button/list replies
            interactive = msg.get("interactive", {})
            if interactive.get("type") == "button_reply":
                text = interactive["button_reply"].get("id", "")
            elif interactive.get("type") == "list_reply":
                text = interactive["list_reply"].get("id", "")
            else:
                text = ""
        else:
            text = ""

        if not phone or not text:
            return {"status": "ignored"}

        # Process the message and advance conversation
        result = await handle_incoming_message(phone, text, wa_message_id, db)

        # After conversation completes, qualify and auto-assign
        lead = db.query(Lead).filter(Lead.phone == phone).order_by(Lead.created_at.desc()).first()
        if lead and lead.status == LeadStatus.QUALIFIED and lead.assigned_agent_id is None:
            qualify_lead(lead, db)
            await assign_lead_to_agent(lead, db)

        return {"status": "processed", "result": result}

    except Exception as e:
        # Log but don't crash — Meta expects 200 OK always
        print(f"[Webhook Error] {e}")
        return {"status": "error", "detail": str(e)}
