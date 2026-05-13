"""
Real Estate Lead Qualifier - Main FastAPI Application
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from app.models.database import init_db, SessionLocal
from app.routes import leads, agents, webhook
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


@app.get("/debug/config", tags=["Health"])
def debug_config():
    """Temporary debug endpoint to verify env vars are loaded on Railway."""
    from app.config import settings
    return {
        "phone_number_id": settings.WHATSAPP_PHONE_NUMBER_ID[:6] + "..." if settings.WHATSAPP_PHONE_NUMBER_ID else "EMPTY",
        "token_set": bool(settings.WHATSAPP_ACCESS_TOKEN),
        "token_prefix": settings.WHATSAPP_ACCESS_TOKEN[:10] + "..." if settings.WHATSAPP_ACCESS_TOKEN else "EMPTY",
        "verify_token": settings.WHATSAPP_VERIFY_TOKEN,
        "db_url": settings.DATABASE_URL[:20] + "..." if settings.DATABASE_URL else "EMPTY",
    }
