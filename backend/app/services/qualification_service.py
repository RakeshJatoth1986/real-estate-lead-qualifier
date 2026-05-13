"""
Lead Qualification & Scoring Engine
Scores leads based on budget, timeline, intent, and engagement.
Result: HOT 🔥 / WARM 🌡️ / COLD ❄️ / UNQUALIFIED
"""
from typing import Tuple
from sqlalchemy.orm import Session
from app.models.lead import Lead, LeadScore, LeadStatus


# ─────────────────────────────────────────────
# Scoring weights (total = 100 points)
# ─────────────────────────────────────────────
BUDGET_SCORES = {
    # (min, max) -> points
    (50000000, float("inf")): 30,   # Above 5 Cr
    (20000000, 50000000): 25,        # 2-5 Cr
    (10000000, 20000000): 20,        # 1-2 Cr
    (5000000, 10000000): 15,         # 50L-1Cr
    (0, 5000000): 10,                # Below 50L
}

TIMELINE_SCORES = {
    "immediate": 30,
    "3_months": 25,
    "6_months": 15,
    "1_year": 10,
    "exploring": 5,
}

PURPOSE_SCORES = {
    "self_use": 20,
    "both": 20,
    "investment": 15,
}

ENGAGEMENT_SCORES = {
    # Based on how many questions answered (out of 6)
    6: 20,
    5: 15,
    4: 10,
    3: 5,
    2: 2,
    1: 0,
    0: 0,
}

# Score thresholds
HOT_THRESHOLD = 70
WARM_THRESHOLD = 40


def calculate_score(lead: Lead) -> Tuple[float, str]:
    """
    Calculate a numeric score (0-100) and label (hot/warm/cold/unqualified).
    Returns (score_value, score_label)
    """
    score = 0.0

    # 1. Budget score (30 pts)
    if lead.budget_max is not None:
        for (bmin, bmax), pts in BUDGET_SCORES.items():
            if bmin <= lead.budget_max <= bmax:
                score += pts
                break

    # 2. Timeline score (30 pts)
    if lead.purchase_timeline:
        score += TIMELINE_SCORES.get(lead.purchase_timeline, 0)

    # 3. Purpose score (20 pts)
    if lead.purpose:
        score += PURPOSE_SCORES.get(lead.purpose, 0)

    # 4. Engagement score (20 pts) — how many fields were filled
    filled = sum([
        1 if lead.property_type else 0,
        1 if lead.bhk_preference else 0,
        1 if lead.location_preference else 0,
        1 if lead.budget_max is not None else 0,
        1 if lead.purchase_timeline else 0,
        1 if lead.purpose else 0,
    ])
    score += ENGAGEMENT_SCORES.get(filled, 0)

    # Determine label
    if filled == 0:
        label = LeadScore.UNQUALIFIED
    elif score >= HOT_THRESHOLD:
        label = LeadScore.HOT
    elif score >= WARM_THRESHOLD:
        label = LeadScore.WARM
    else:
        label = LeadScore.COLD

    return round(score, 2), label


def qualify_lead(lead: Lead, db: Session) -> Lead:
    """
    Run the scoring engine on a lead and persist the result.
    """
    score_value, score_label = calculate_score(lead)
    lead.score_value = score_value
    lead.score = score_label
    if lead.status == LeadStatus.CONTACTED:
        lead.status = LeadStatus.QUALIFIED
    db.commit()
    db.refresh(lead)
    return lead


def get_score_summary(lead: Lead) -> dict:
    """Return a human-readable score summary for the dashboard."""
    score_value, score_label = calculate_score(lead)
    emoji_map = {
        LeadScore.HOT: "🔥 Hot",
        LeadScore.WARM: "🌡️ Warm",
        LeadScore.COLD: "❄️ Cold",
        LeadScore.UNQUALIFIED: "⚪ Unqualified",
    }
    return {
        "score": score_value,
        "label": score_label,
        "display": emoji_map.get(score_label, score_label),
        "breakdown": {
            "budget": lead.budget_max,
            "timeline": lead.purchase_timeline,
            "purpose": lead.purpose,
            "fields_filled": sum([
                1 if lead.property_type else 0,
                1 if lead.bhk_preference else 0,
                1 if lead.location_preference else 0,
                1 if lead.budget_max is not None else 0,
                1 if lead.purchase_timeline else 0,
                1 if lead.purpose else 0,
            ]),
        },
    }
