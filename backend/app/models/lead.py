from sqlalchemy import Column, Integer, String, Float, DateTime, Text, ForeignKey, Enum, Boolean
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.models.database import Base


class LeadStatus(str, enum.Enum):
    NEW = "new"
    CONTACTED = "contacted"
    QUALIFIED = "qualified"
    ASSIGNED = "assigned"
    CONVERTED = "converted"
    LOST = "lost"


class LeadScore(str, enum.Enum):
    HOT = "hot"
    WARM = "warm"
    COLD = "cold"
    UNQUALIFIED = "unqualified"


class LeadSource(str, enum.Enum):
    GOOGLE_FORM = "google_form"
    WEBSITE = "website"
    FACEBOOK_ADS = "facebook_ads"
    PORTAL_99ACRES = "99acres"
    PORTAL_MAGICBRICKS = "magicbricks"
    MANUAL = "manual"
    OTHER = "other"


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    
    # Basic Info
    name = Column(String(200), nullable=False)
    phone = Column(String(20), nullable=False, index=True)
    email = Column(String(200), nullable=True)
    source = Column(String(50), default=LeadSource.GOOGLE_FORM)
    
    # Property Requirements (filled via WhatsApp conversation)
    budget_min = Column(Float, nullable=True)
    budget_max = Column(Float, nullable=True)
    property_type = Column(String(100), nullable=True)   # apartment, villa, plot, commercial
    location_preference = Column(String(200), nullable=True)
    bhk_preference = Column(String(50), nullable=True)   # 1BHK, 2BHK, 3BHK, etc.
    purchase_timeline = Column(String(100), nullable=True)  # immediate, 3months, 6months, 1year
    purpose = Column(String(100), nullable=True)  # self_use, investment
    
    # Qualification
    score = Column(String(20), default=LeadScore.UNQUALIFIED)
    score_value = Column(Float, default=0.0)
    status = Column(String(30), default=LeadStatus.NEW)
    
    # WhatsApp conversation state
    wa_conversation_step = Column(Integer, default=0)
    wa_last_message_at = Column(DateTime, nullable=True)
    
    # Assignment
    assigned_agent_id = Column(Integer, ForeignKey("agents.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    
    # Agent follow-up
    follow_up_status = Column(String(50), nullable=True)   # interested/not_interested/follow_up_scheduled/negotiating/lost
    expected_conversion_date = Column(DateTime, nullable=True)
    agent_notes = Column(Text, nullable=True)

    # Agent handover — when True, bot stops auto-responding
    agent_handling = Column(Boolean, default=False)

    # Notes
    notes = Column(Text, nullable=True)
    raw_form_data = Column(Text, nullable=True)  # JSON string of original form submission
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    agent = relationship("Agent", back_populates="leads")
    messages = relationship("WhatsAppMessage", back_populates="lead")


class WhatsAppMessage(Base):
    __tablename__ = "whatsapp_messages"

    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False)
    direction = Column(String(10))  # inbound / outbound
    message_text = Column(Text)
    wa_message_id = Column(String(200), nullable=True)
    timestamp = Column(DateTime, default=datetime.utcnow)

    lead = relationship("Lead", back_populates="messages")
