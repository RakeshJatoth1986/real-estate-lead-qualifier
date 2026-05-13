# 📱 WhatsApp Cloud API — Complete Setup Guide

This guide walks you through connecting your Real Estate Lead Qualifier to WhatsApp using **Meta's free Cloud API**.

---

## 🗺️ Overview of What We're Setting Up

```
Lead replies on WhatsApp
        ↓
Meta's WhatsApp servers receive the message
        ↓
Meta sends it to YOUR server via webhook (HTTP POST)
        ↓
Your FastAPI backend processes it, advances conversation
        ↓
Backend sends next question back to lead via WhatsApp API
```

For this to work, Meta needs to reach your local server. Since your server runs on `localhost`, we use **ngrok** to create a public tunnel.

---

## PART 1 — Create a Meta Developer Account & App

### Step 1: Create a Meta Developer Account
1. Go to 👉 https://developers.facebook.com/
2. Click **"Get Started"** (top right)
3. Log in with your **Facebook account** (or create one)
4. Complete the developer registration

### Step 2: Create a New App
1. Go to 👉 https://developers.facebook.com/apps/
2. Click **"Create App"**
3. Select **"Business"** as the app type → Click **Next**
4. Fill in:
   - **App Name**: `Real Estate Lead Qualifier` (or any name)
   - **App Contact Email**: your email
5. Click **"Create App"**

### Step 3: Add WhatsApp to Your App
1. On your app dashboard, scroll down to find **"WhatsApp"**
2. Click **"Set Up"** next to WhatsApp
3. You'll be taken to the **WhatsApp Getting Started** page

---

## PART 2 — Get Your Credentials

### Step 4: Get Phone Number ID and Access Token
On the **WhatsApp → Getting Started** page:

1. You'll see a **"From"** phone number — this is Meta's test number
   - Copy the **Phone Number ID** (looks like: `123456789012345`)
   - This goes into your `.env` as `WHATSAPP_PHONE_NUMBER_ID`

2. Scroll up to find **"Temporary access token"**
   - Click **"Generate"** to get a token (valid for 24 hours for testing)
   - Copy it — this goes into your `.env` as `WHATSAPP_ACCESS_TOKEN`
   - ⚠️ For production, you'll create a **permanent System User token** (explained at the end)

3. Under **"To"** — add your personal WhatsApp number as a test recipient
   - Click **"Add phone number"**
   - Enter your WhatsApp number with country code (e.g., `+91 98765 43210`)
   - Verify with the OTP sent to your WhatsApp

### Step 5: Update Your .env File
```bash
cd /Users/rakeshjatoth/Desktop/real-estate-lead-qualifier/backend
cp .env.example .env
```

Open `.env` and fill in:
```env
WHATSAPP_PHONE_NUMBER_ID=123456789012345      # from Step 4
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxx     # from Step 4
WHATSAPP_VERIFY_TOKEN=real_estate_verify_token  # keep this as-is
WHATSAPP_API_VERSION=v19.0
```

### Step 6: Test Sending a Message (Optional Verification)
Run this curl command to verify your credentials work:
```bash
curl -X POST \
  "https://graph.facebook.com/v19.0/YOUR_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "91XXXXXXXXXX",
    "type": "text",
    "text": {"body": "Hello from Real Estate Lead Qualifier! 🏠"}
  }'
```
Replace `YOUR_PHONE_NUMBER_ID`, `YOUR_ACCESS_TOKEN`, and `91XXXXXXXXXX` with your values.

If you get `{"messages":[{"id":"wamid.xxx"}]}` — it's working! ✅

---

## PART 3 — Expose Your Local Server with ngrok

Meta needs a **public HTTPS URL** to send webhook events to. Since your server runs on `localhost:8000`, we use ngrok to create a tunnel.

### Step 7: Install ngrok
```bash
# Option A: Download from website
# Go to https://ngrok.com/download → download for macOS ARM

# Option B: Via Homebrew (if installed)
brew install ngrok

# Option C: Direct download
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.dmg -o /tmp/ngrok.dmg
open /tmp/ngrok.dmg
```

### Step 8: Sign Up for ngrok (Free)
1. Go to 👉 https://ngrok.com/
2. Sign up for a free account
3. Go to your dashboard → **"Your Authtoken"**
4. Copy your authtoken and run:
```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### Step 9: Start ngrok Tunnel
Make sure your backend is running first:
```bash
# Terminal 1 — Start backend
cd /Users/rakeshjatoth/Desktop/real-estate-lead-qualifier/backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — Start ngrok
ngrok http 8000
```

You'll see output like:
```
Forwarding    https://abc123def456.ngrok-free.app -> http://localhost:8000
```

📋 **Copy the `https://` URL** — you'll need it in the next step.

---

## PART 4 — Configure the Webhook in Meta Dashboard

### Step 10: Set Up the Webhook
1. In Meta Developer Dashboard → Your App → **WhatsApp → Configuration**
2. Under **"Webhook"**, click **"Edit"**
3. Fill in:
   - **Callback URL**: `https://abc123def456.ngrok-free.app/webhook/whatsapp`
     (replace with your actual ngrok URL)
   - **Verify Token**: `real_estate_verify_token`
     (must match `WHATSAPP_VERIFY_TOKEN` in your `.env`)
4. Click **"Verify and Save"**

What happens: Meta sends a GET request to your URL with a challenge. Your backend echoes it back, confirming the webhook is valid. ✅

### Step 11: Subscribe to Webhook Events
After verification:
1. Under **"Webhook fields"**, click **"Manage"**
2. Enable **"messages"** ✅
3. Click **"Done"**

---

## PART 5 — Test the Full Flow

### Step 12: Test End-to-End
1. Make sure backend is running (`uvicorn app.main:app --reload --port 8000`)
2. Make sure ngrok is running (`ngrok http 8000`)
3. Add a test lead via the dashboard at http://localhost:3000 (click "+ Add Lead")
   - Use your own WhatsApp number as the phone
4. The system will send you a WhatsApp message asking about property type
5. Reply with `1`, `2`, `3`, or `4`
6. Continue the conversation — after 6 replies, the lead gets scored and assigned!

---

## PART 6 — Production Setup (Permanent Token)

The temporary token expires in 24 hours. For production:

### Step 13: Create a Permanent System User Token
1. Go to 👉 https://business.facebook.com/
2. Go to **Settings → Users → System Users**
3. Click **"Add"** → Create a System User with **Admin** role
4. Click **"Generate New Token"**
5. Select your app
6. Enable permissions: `whatsapp_business_messaging`, `whatsapp_business_management`
7. Copy the token → update `WHATSAPP_ACCESS_TOKEN` in `.env`

### Step 14: Add a Real Business Phone Number
The test number only allows messaging to verified test numbers.
For real leads:
1. WhatsApp → **Phone Numbers → Add Phone Number**
2. Add your business WhatsApp number
3. Verify via OTP
4. Update `WHATSAPP_PHONE_NUMBER_ID` in `.env`

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| Webhook verification fails | Check `WHATSAPP_VERIFY_TOKEN` matches exactly in `.env` and Meta dashboard |
| Messages not received | Check ngrok is running and URL is correct in Meta dashboard |
| Token expired | Generate a new temporary token or create a permanent System User token |
| "Not a valid phone number" | Use full international format: `919876543210` (no +, no spaces) |
| Lead not found for incoming message | The phone number in WhatsApp must match exactly what was entered in the form |

---

## 📋 Quick Reference Checklist

- [ ] Meta Developer account created
- [ ] App created with WhatsApp product added
- [ ] Phone Number ID copied to `.env`
- [ ] Access Token copied to `.env`
- [ ] Test phone number added and verified in Meta dashboard
- [ ] ngrok installed and authenticated
- [ ] Backend running on port 8000
- [ ] ngrok tunnel running (`ngrok http 8000`)
- [ ] Webhook URL set in Meta dashboard (ngrok URL + `/webhook/whatsapp`)
- [ ] Verify Token set to `real_estate_verify_token`
- [ ] Webhook verified ✅
- [ ] "messages" webhook field subscribed ✅
- [ ] Test lead added → WhatsApp message received ✅
