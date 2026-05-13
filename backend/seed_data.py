"""
Seed script: populates the database with 10 demo agents and 15 sample leads.
Run: python seed_data.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app.models.database import init_db, SessionLocal
from app.models.agent import Agent
from app.models.lead import Lead, LeadStatus, LeadScore, LeadSource
from app.services.qualification_service import qualify_lead
from datetime import datetime, timedelta
import random

def seed():
    init_db()
    db = SessionLocal()

    # ── 10 Demo Agents ────────────────────────────────────────────────────────
    agents_data = [
        {"name": "Priya Sharma",    "phone": "919900000001", "whatsapp_number": "919900000001", "specialization": "Luxury Apartments", "areas_covered": "whitefield, indiranagar, koramangala"},
        {"name": "Rahul Mehta",     "phone": "919900000002", "whatsapp_number": "919900000002", "specialization": "Villas & Plots",    "areas_covered": "sarjapur, electronic city, hsr layout"},
        {"name": "Anita Desai",     "phone": "919900000003", "whatsapp_number": "919900000003", "specialization": "Affordable Housing", "areas_covered": "yelahanka, hebbal, devanahalli"},
        {"name": "Suresh Kumar",    "phone": "919900000004", "whatsapp_number": "919900000004", "specialization": "Commercial Spaces",  "areas_covered": "mg road, brigade road, ulsoor"},
        {"name": "Deepa Nair",      "phone": "919900000005", "whatsapp_number": "919900000005", "specialization": "Investment Properties", "areas_covered": "marathahalli, bellandur, varthur"},
        {"name": "Vikram Singh",    "phone": "919900000006", "whatsapp_number": "919900000006", "specialization": "Premium Villas",    "areas_covered": "jp nagar, banashankari, jayanagar"},
        {"name": "Meena Pillai",    "phone": "919900000007", "whatsapp_number": "919900000007", "specialization": "2BHK & 3BHK Flats", "areas_covered": "rajajinagar, malleshwaram, yeshwanthpur"},
        {"name": "Arjun Reddy",     "phone": "919900000008", "whatsapp_number": "919900000008", "specialization": "Plots & Land",      "areas_covered": "kanakapura road, bannerghatta road, mysore road"},
        {"name": "Sunita Joshi",    "phone": "919900000009", "whatsapp_number": "919900000009", "specialization": "NRI Properties",    "areas_covered": "whitefield, sarjapur, electronic city"},
        {"name": "Kiran Bhat",      "phone": "919900000010", "whatsapp_number": "919900000010", "specialization": "Resale Properties", "areas_covered": "btm layout, bommanahalli, silk board"},
    ]

    agents = []
    for data in agents_data:
        existing = db.query(Agent).filter(Agent.phone == data["phone"]).first()
        if not existing:
            agent = Agent(**data, max_leads=20)
            db.add(agent)
            agents.append(agent)
        else:
            agents.append(existing)
    db.commit()
    print(f"✅ {len(agents_data)} agents seeded")

    # Refresh agents list
    agents = db.query(Agent).all()

    # ── 15 Demo Leads ─────────────────────────────────────────────────────────
    leads_data = [
        # HOT leads
        {"name": "Rajesh Iyer",      "phone": "919811000001", "email": "rajesh@email.com",  "property_type": "Apartment",  "bhk_preference": "3 BHK", "location_preference": "Whitefield",      "budget_min": 10000000, "budget_max": 20000000, "purchase_timeline": "immediate",  "purpose": "self_use",   "source": LeadSource.GOOGLE_FORM},
        {"name": "Kavitha Rao",      "phone": "919811000002", "email": "kavitha@email.com", "property_type": "Villa",      "bhk_preference": "4+ BHK","location_preference": "Sarjapur",        "budget_min": 20000000, "budget_max": 50000000, "purchase_timeline": "immediate",  "purpose": "self_use",   "source": LeadSource.GOOGLE_FORM},
        {"name": "Mohan Das",        "phone": "919811000003", "email": "mohan@email.com",   "property_type": "Apartment",  "bhk_preference": "2 BHK", "location_preference": "Koramangala",     "budget_min": 10000000, "budget_max": 20000000, "purchase_timeline": "3_months",   "purpose": "investment", "source": LeadSource.GOOGLE_FORM},
        # WARM leads
        {"name": "Sneha Kulkarni",   "phone": "919811000004", "email": "sneha@email.com",   "property_type": "Apartment",  "bhk_preference": "2 BHK", "location_preference": "Hebbal",          "budget_min": 5000000,  "budget_max": 10000000, "purchase_timeline": "3_months",   "purpose": "self_use",   "source": LeadSource.GOOGLE_FORM},
        {"name": "Arun Krishnan",    "phone": "919811000005", "email": "arun@email.com",    "property_type": "Plot",       "bhk_preference": "N/A",   "location_preference": "Kanakapura Road", "budget_min": 5000000,  "budget_max": 10000000, "purchase_timeline": "6_months",   "purpose": "investment", "source": LeadSource.GOOGLE_FORM},
        {"name": "Pooja Verma",      "phone": "919811000006", "email": "pooja@email.com",   "property_type": "Apartment",  "bhk_preference": "3 BHK", "location_preference": "Marathahalli",    "budget_min": 10000000, "budget_max": 20000000, "purchase_timeline": "6_months",   "purpose": "self_use",   "source": LeadSource.GOOGLE_FORM},
        {"name": "Sunil Patil",      "phone": "919811000007", "email": "sunil@email.com",   "property_type": "Villa",      "bhk_preference": "3 BHK", "location_preference": "JP Nagar",        "budget_min": 20000000, "budget_max": 50000000, "purchase_timeline": "6_months",   "purpose": "both",       "source": LeadSource.GOOGLE_FORM},
        {"name": "Lakshmi Menon",    "phone": "919811000008", "email": "lakshmi@email.com", "property_type": "Apartment",  "bhk_preference": "2 BHK", "location_preference": "Yeshwanthpur",    "budget_min": 5000000,  "budget_max": 10000000, "purchase_timeline": "3_months",   "purpose": "investment", "source": LeadSource.GOOGLE_FORM},
        # COLD leads
        {"name": "Ganesh Murthy",    "phone": "919811000009", "email": "ganesh@email.com",  "property_type": "Apartment",  "bhk_preference": "1 BHK", "location_preference": "Electronic City", "budget_min": 0,        "budget_max": 5000000,  "purchase_timeline": "1_year",     "purpose": "self_use",   "source": LeadSource.GOOGLE_FORM},
        {"name": "Divya Shetty",     "phone": "919811000010", "email": "divya@email.com",   "property_type": "Apartment",  "bhk_preference": "2 BHK", "location_preference": "Yelahanka",       "budget_min": 0,        "budget_max": 5000000,  "purchase_timeline": "exploring",  "purpose": "self_use",   "source": LeadSource.GOOGLE_FORM},
        {"name": "Ravi Shankar",     "phone": "919811000011", "email": "ravi@email.com",    "property_type": "Plot",       "bhk_preference": "N/A",   "location_preference": "Mysore Road",     "budget_min": 0,        "budget_max": 5000000,  "purchase_timeline": "1_year",     "purpose": "investment", "source": LeadSource.GOOGLE_FORM},
        # NEW / Unqualified (just came in, WhatsApp not done)
        {"name": "Preethi Nair",     "phone": "919811000012", "email": "preethi@email.com", "property_type": None,         "bhk_preference": None,    "location_preference": None,              "budget_min": None,     "budget_max": None,     "purchase_timeline": None,         "purpose": None,         "source": LeadSource.GOOGLE_FORM},
        {"name": "Harish Gowda",     "phone": "919811000013", "email": "harish@email.com",  "property_type": None,         "bhk_preference": None,    "location_preference": None,              "budget_min": None,     "budget_max": None,     "purchase_timeline": None,         "purpose": None,         "source": LeadSource.GOOGLE_FORM},
        {"name": "Meghana Reddy",    "phone": "919811000014", "email": "meghana@email.com", "property_type": "Apartment",  "bhk_preference": "2 BHK", "location_preference": "Indiranagar",     "budget_min": None,     "budget_max": None,     "purchase_timeline": None,         "purpose": None,         "source": LeadSource.GOOGLE_FORM},
        {"name": "Sanjay Bhatt",     "phone": "919811000015", "email": "sanjay@email.com",  "property_type": "Commercial", "bhk_preference": "N/A",   "location_preference": "MG Road",         "budget_min": 20000000, "budget_max": 50000000, "purchase_timeline": "immediate",  "purpose": "investment", "source": LeadSource.GOOGLE_FORM},
    ]

    created_leads = []
    for i, data in enumerate(leads_data):
        existing = db.query(Lead).filter(Lead.phone == data["phone"]).first()
        if existing:
            created_leads.append(existing)
            continue

        status = LeadStatus.NEW
        wa_step = 0
        if data["property_type"] and data["purchase_timeline"]:
            status = LeadStatus.QUALIFIED
            wa_step = 7
        elif data["property_type"]:
            status = LeadStatus.CONTACTED
            wa_step = 3

        lead = Lead(
            **{k: v for k, v in data.items()},
            status=status,
            wa_conversation_step=wa_step,
            created_at=datetime.utcnow() - timedelta(hours=random.randint(1, 72)),
        )
        db.add(lead)
        db.flush()

        # Score the lead
        if status == LeadStatus.QUALIFIED:
            qualify_lead(lead, db)

        created_leads.append(lead)

    db.commit()
    print(f"✅ {len(leads_data)} leads seeded")

    # Assign qualified leads to agents
    agents_list = db.query(Agent).all()
    qualified = db.query(Lead).filter(Lead.status == LeadStatus.QUALIFIED).all()
    for i, lead in enumerate(qualified):
        if lead.assigned_agent_id is None:
            agent = agents_list[i % len(agents_list)]
            lead.assigned_agent_id = agent.id
            lead.assigned_at = datetime.utcnow()
            lead.status = LeadStatus.ASSIGNED
            agent.total_leads_assigned += 1
    db.commit()
    print(f"✅ Qualified leads assigned to agents")

    db.close()
    print("\n🎉 Seed complete! You can now start the backend and frontend.")


if __name__ == "__main__":
    seed()
