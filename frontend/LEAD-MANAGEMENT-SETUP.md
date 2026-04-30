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

- Manager: `manager@nexuscrm.ai` / `demo123`
- Sales: `sales@nexuscrm.ai` / `demo123`

## Supported Module Capabilities

- Manual lead creation
- Meta Ads webhook capture
- Auto-create lead from unknown WhatsApp number
- Auto-create lead from unknown IVR/caller number
- Click-to-call logging and IVR webhook ingestion
- WhatsApp template send and webhook ingestion
- Lead assignment, reminders, and workflow automation
- Timeline view for calls, notes, messages, and status updates
- JWT access and refresh token flow

## Live Webhook URLs

Use these callback URLs in your provider dashboards:

- WhatsApp webhook: http://localhost:4000/api/webhooks/whatsapp
- IVR webhook: http://localhost:4000/api/webhooks/ivr
- Meta Ads webhook: http://localhost:4000/api/webhooks/meta-ads

## Automatic Inbound Lead Creation

If a WhatsApp message or phone call comes from a number that does not already exist in the CRM:

- a new lead is created automatically
- the conversation or call log is attached
- the lead is assigned to the best matching staff member
- the follow-up workflow starts immediately

## Optional Frontend API Binding

Set this environment variable for the frontend if you want explicit API binding:

- `VITE_CRM_API_URL=http://localhost:4000/api`
