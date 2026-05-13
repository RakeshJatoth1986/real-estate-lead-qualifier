# 🏠 Real Estate Lead Qualifier — Demo

An end-to-end automated lead qualification system for real estate companies.

## 🏗️ Architecture

```
Google Form → Apps Script Webhook → FastAPI Backend → WhatsApp Bot (Meta Cloud API)
                                          ↓
                              Lead Scoring Engine (0-100)
                                          ↓
                              Auto Agent Assignment + WhatsApp Notification
                                          ↓
                              React Admin Dashboard
```

## 📁 Project Structure

```
real-estate-lead-qualifier/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI app entry point
│   │   ├── config.py                  # Settings from .env
│   │   ├── models/
│   │   │   ├── lead.py                # Lead & WhatsAppMessage models
│   │   │   └── agent.py               # Agent model
│   │   ├── routes/
│   │   │   ├── leads.py               # Lead CRUD + ingest endpoint
│   │   │   ├── agents.py              # Agent CRUD
│   │   │   └── webhook.py             # WhatsApp webhook (Meta)
│   │   └── services/
│   │       ├── whatsapp_service.py    # WhatsApp conversation flow
│   │       ├── qualification_service.py # Lead scoring engine
│   │       └── assignment_service.py  # Auto agent assignment
│   ├── seed_data.py                   # Demo data (10 agents, 15 leads)
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   └── src/
│       ├── App.js                     # Full dashboard UI
│       └── services/api.js            # API client
└── docs/
    └── google_apps_script.js          # Paste into Google Form's Script Editor
```

---

## 🚀 Quick Start (Demo)

### Step 1: Backend Setup

```bash
cd real-estate-lead-qualifier/backend

# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy env file
cp .env.example .env
# Edit .env with your WhatsApp credentials (optional for demo)

# Seed demo data (10 agents + 15 leads)
python seed_data.py

# Start backend
uvicorn app.main:app --reload --port 8000
```

Backend runs at: http://localhost:8000  
API Docs (Swagger): http://localhost:8000/docs

---

### Step 2: Frontend Setup

```bash
cd real-estate-lead-qualifier/frontend

# Install dependencies
npm install

# Start dashboard
npm start
```

Dashboard runs at: http://localhost:3000

---

## 🔑 WhatsApp Setup (Meta Cloud API)

1. Go to [Meta for Developers](https://developers.facebook.com/)
2. Create an App → Add "WhatsApp" product
3. Get your **Phone Number ID** and **Access Token**
4. Add to `.env`:
   ```
   WHATSAPP_PHONE_NUMBER_ID=your_id
   WHATSAPP_ACCESS_TOKEN=your_token
   WHATSAPP_VERIFY_TOKEN=real_estate_verify_token
   ```
5. In Meta Dashboard → Webhooks → Set URL to:
   ```
   https://your-server.com/webhook/whatsapp
   ```
   (Use [ngrok](https://ngrok.com/) for local testing: `ngrok http 8000`)

---

## 📋 Google Form Setup

1. Create a Google Form with these fields:
   - **Full Name** (Short answer)
   - **Phone Number** (Short answer)
   - **Email Address** (Short answer)
   - **Property Type** (Multiple choice: Apartment/Villa/Plot/Commercial)
   - **Preferred Area** (Short answer)

2. Open Form → 3-dot menu → **Script editor**

3. Paste the contents of `docs/google_apps_script.js`

4. Update `BACKEND_URL` to your server URL

5. Add trigger: `onFormSubmit` → On form submit

---

## 🎯 Lead Scoring Algorithm

| Factor | Max Points | Details |
|--------|-----------|---------|
| Budget | 30 pts | Above ₹5Cr = 30, ₹2-5Cr = 25, ₹1-2Cr = 20, ₹50L-1Cr = 15, Below ₹50L = 10 |
| Timeline | 30 pts | Immediate = 30, 3 months = 25, 6 months = 15, 1 year = 10, Exploring = 5 |
| Purpose | 20 pts | Self Use/Both = 20, Investment = 15 |
| Engagement | 20 pts | All 6 questions answered = 20 |

**Score Labels:**
- 🔥 **Hot** — Score ≥ 70
- 🌡️ **Warm** — Score 40–69
- ❄️ **Cold** — Score < 40
- ⚪ **Unqualified** — No data yet

---

## 🤖 Auto-Assignment Logic

1. Filter agents who are **active** and under their **max_leads cap**
2. **Location matching** — prefer agents whose `areas_covered` matches lead's location
3. **Load balancing** — among matched agents, pick the one with fewest active leads
4. **Notify agent** via WhatsApp with full lead details

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/leads/ingest` | Receive lead from Google Form |
| GET | `/leads/` | List leads (with filters) |
| GET | `/leads/stats` | Dashboard statistics |
| GET | `/leads/{id}` | Lead detail |
| PUT | `/leads/{id}` | Update lead |
| POST | `/leads/{id}/qualify` | Run scoring |
| POST | `/leads/{id}/assign` | Assign to agent |
| GET | `/leads/{id}/messages` | WhatsApp history |
| GET | `/webhook/whatsapp` | Meta webhook verification |
| POST | `/webhook/whatsapp` | Receive WhatsApp messages |
| GET | `/agents/` | List agents |
| POST | `/agents/` | Create agent |
| PUT | `/agents/{id}` | Update agent |

---

## 🔌 Extending to Other Lead Sources

To add new lead sources (website, Facebook Ads, 99acres), simply POST to `/leads/ingest` with:
```json
{
  "name": "Lead Name",
  "phone": "919876543210",
  "email": "lead@email.com",
  "source": "website",
  "property_type": "Apartment",
  "location_preference": "Whitefield"
}
```

---

## 🛠️ Tech Stack

- **Backend**: Python 3.11 + FastAPI + SQLAlchemy + SQLite
- **WhatsApp**: Meta Cloud API (free tier)
- **Frontend**: React 18 (no extra UI library needed)
- **Scheduler**: APScheduler (auto-assign every 5 min)
- **Lead Source**: Google Forms + Apps Script
