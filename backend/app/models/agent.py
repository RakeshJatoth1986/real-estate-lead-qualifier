from sqlalchemy import Column, Integer, String, Boolean, DateTime, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.models.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    phone = Column(String(20), nullable=False, unique=True)
    email = Column(String(200), nullable=True)
    whatsapp_number = Column(String(20), nullable=True)

    # Specialization
    specialization = Column(String(200), nullable=True)  # e.g. "luxury villas, south bangalore"
    areas_covered = Column(String(500), nullable=True)   # comma-separated areas

    # Availability
    is_active = Column(Boolean, default=True)
    max_leads = Column(Integer, default=20)  # max concurrent leads

    # Stats
    total_leads_assigned = Column(Integer, default=0)
    total_converted = Column(Integer, default=0)
    conversion_rate = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    leads = relationship("Lead", back_populates="agent")

    @property
    def active_lead_count(self):
        return sum(1 for lead in self.leads if lead.status not in ["converted", "lost"])
