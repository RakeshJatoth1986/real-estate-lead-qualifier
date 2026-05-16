"""
Real Estate Lead Qualifier - Main FastAPI Application
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.models.database import init_db, SessionLocal
from app.routes import leads, agents, webhook
from app.routes.auth import router as auth_router
from app.services.assignment_service import auto_assign_qualified_leads
from app.services.qualification_service import qualify_lead
from app.models.lead import Lead, LeadStatus

scheduler = AsyncIOScheduler()


async def scheduled_qualify_and_assign():
    """
    Runs every 5 minutes:
    1. Re-qualify all leads that have completed the WhatsApp conversation
    2. Auto-assign qualified leads that haven't been assigned yet
    """
    db = SessionLocal()
    try:
        # Qualify leads that finished conversation but haven't been scored
        completed_leads = (
            db.query(Lead)
            .filter(Lead.status == LeadStatus.QUALIFIED, Lead.score == "unqualified")
            .all()
        )
        for lead in completed_leads:
            qualify_lead(lead, db)

        # Auto-assign qualified unassigned leads
        await auto_assign_qualified_leads(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    scheduler.add_job(scheduled_qualify_and_assign, "interval", minutes=5, id="auto_assign")
    scheduler.start()
    print("✅ Database initialized")
    print("✅ Scheduler started (auto-assign every 5 min)")
    yield
    # Shutdown
    scheduler.shutdown()


app = FastAPI(
    title="Real Estate Lead Qualifier",
    description=(
        "Automated lead qualification system for real estate companies. "
        "Collects leads from Google Forms, qualifies via WhatsApp conversations, "
        "scores them, and assigns to sales agents automatically."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth_router)
app.include_router(leads.router)
app.include_router(agents.router)
app.include_router(webhook.router)


@app.get("/", tags=["Health"])
def root():
    return {
        "service": "Real Estate Lead Qualifier",
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy"}


@app.post("/debug/send-whatsapp/{lead_id}", tags=["Health"])
async def debug_send_whatsapp(lead_id: int):
    """Debug: directly call initiate_conversation and return result."""
    from app.models.database import SessionLocal
    from app.models.lead import Lead
    from app.services.whatsapp_service import initiate_conversation
    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            return {"error": "lead not found"}
        lead.wa_conversation_step = 0  # reset
        db.commit()
        result = await initiate_conversation(lead, db)
        return {"result": result, "wa_step": lead.wa_conversation_step}
    except Exception as e:
        return {"error": str(e), "type": type(e).__name__}
    finally:
        db.close()


@app.post("/debug/send-message/{lead_id}", tags=["Health"])
async def debug_send_message(lead_id: int, message: str):
    """Debug: send any message to a lead via WhatsApp (no auth needed)."""
    from app.models.database import SessionLocal
    from app.models.lead import Lead
    from app.services.whatsapp_service import send_whatsapp_message, save_message
    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            return {"error": "lead not found"}
        result = await send_whatsapp_message(lead.phone, message)
        if "error" in result:
            return {"error": result["error"]}
        wa_id = result.get("messages", [{}])[0].get("id")
        save_message(db, lead.id, "outbound", message, wa_id)
        return {"status": "sent", "wa_id": wa_id}
    except Exception as e:
        return {"error": str(e)}
    finally:
        db.close()


@app.post("/debug/fix-migration", tags=["Health"])
def debug_fix_migration():
    """Debug: manually run pending migrations."""
    from app.models.database import engine
    import sqlalchemy
    results = []
    migrations = [
        "ALTER TABLE agents ADD COLUMN IF NOT EXISTS hashed_pin VARCHAR(200)",
        "ALTER TABLE leads ADD COLUMN IF NOT EXISTS agent_handling BOOLEAN DEFAULT FALSE",
    ]
    with engine.connect() as conn:
        for sql in migrations:
            try:
                conn.execute(sqlalchemy.text(sql))
                conn.commit()
                results.append({"sql": sql, "status": "ok"})
            except Exception as e:
                conn.rollback()
                results.append({"sql": sql, "status": "error", "detail": str(e)})
    return {"results": results}


@app.get("/debug/config", tags=["Health"])
def debug_config():
    """Temporary debug endpoint to verify env vars are loaded on Railway."""
    from app.config import settings
    return {
        "settings_phone_id": settings.WHATSAPP_PHONE_NUMBER_ID[:6] + "..." if settings.WHATSAPP_PHONE_NUMBER_ID else "EMPTY",
        "settings_token_set": bool(settings.WHATSAPP_ACCESS_TOKEN),
        "settings_db_url": settings.DATABASE_URL[:25] + "..." if settings.DATABASE_URL else "EMPTY",
        "os_env_phone_id": os.environ.get("WHATSAPP_PHONE_NUMBER_ID", "NOT_SET")[:6] + "..." if os.environ.get("WHATSAPP_PHONE_NUMBER_ID") else "NOT_SET",
        "os_env_token_set": bool(os.environ.get("WHATSAPP_ACCESS_TOKEN")),
        "os_env_db_url": os.environ.get("DATABASE_URL", "NOT_SET")[:25] + "..." if os.environ.get("DATABASE_URL") else "NOT_SET",
        "railway_env": os.environ.get("RAILWAY_ENVIRONMENT", "NOT_SET"),
        "railway_project": os.environ.get("RAILWAY_PROJECT_NAME", "NOT_SET"),
    }
