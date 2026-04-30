# Lead Management Module Setup

## Frontend

1. Open the frontend folder:
   - `cd nexus-crm`
2. Install dependencies if needed:
   - `npm install`
3. Start the UI:
   - `npm run dev`
4. Open the CRM at:
   - `http://localhost:5173`

## Backend

1. Open the API folder:
   - `cd nexus-crm/backend`
2. Copy `.env.example` to `.env`
3. Install dependencies:
   - `npm install`
4. Start the API:
   - `npm run dev`
5. Health endpoint:
   - `http://localhost:4000/api/health`

## Demo Credentials

Create your first admin from backend environment variables:

- `MONGO_URI=mongodb+srv://...`
- `ADMIN_EMAIL=admin@yourcompany.com`
- `ADMIN_PASSWORD=use-a-long-secure-password`

The admin account is created automatically when the backend first connects to MongoDB.

## Supported Module Capabilities

- Manual lead creation
- Public form capture endpoint with consent-aware processing
- Meta Ads webhook capture
- Auto-create lead from unknown WhatsApp number
- Auto-create lead from unknown IVR/caller number
- Click-to-call logging and IVR webhook ingestion
- WhatsApp template send and webhook ingestion
- Lead deduplication by phone/email
- Dynamic lead scoring and hot/warm/cold segmentation
- Lead assignment, reminders, and workflow automation
- Slack hot-lead alerts and outbound Zapier/Make sync hooks
- Analytics overview endpoint for live source and funnel reporting
- Timeline view for calls, notes, messages, and status updates
- JWT access and refresh token flow

## Live Webhook URLs

Use these callback URLs in your provider dashboards:

- WhatsApp webhook: http://localhost:4000/api/webhooks/whatsapp
- IVR webhook: http://localhost:4000/api/webhooks/ivr
- Meta Ads webhook: http://localhost:4000/api/webhooks/meta-ads
- Public form capture: http://localhost:4000/api/capture/forms
- Analytics overview: http://localhost:4000/api/analytics/overview
- Automation blueprint: http://localhost:4000/api/automation/blueprint

## Automatic Inbound Lead Creation

If a WhatsApp message or phone call comes from a number that does not already exist in the CRM:

- a new lead is created automatically
- the conversation or call log is attached
- the lead is assigned to the best matching staff member
- the follow-up workflow starts immediately

## Optional Frontend API Binding

Set this environment variable for the frontend if you want explicit API binding:

- `VITE_CRM_API_URL=http://localhost:4000/api`

## Production Environment Variables

Recommended backend variables for real integrations:

- `MONGO_URI`
- `FRONTEND_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `META_ACCESS_TOKEN`
- `META_PAGE_ID`
- `META_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `LEAD_EMAIL_WEBHOOK_URL`
- `SLACK_WEBHOOK_URL`
- `ZAPIER_WEBHOOK_URL` or `MAKE_WEBHOOK_URL`
