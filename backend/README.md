# Nexus CRM Lead Management Backend

This backend provides the API layer for lead capture, calling, WhatsApp messaging, automation, webhook ingestion, and JWT auth with refresh tokens.

## Features

- Express REST API for leads, calls, and messages
- MongoDB schema definitions with Mongoose
- JWT login and refresh token endpoints
- Meta Ads lead webhook handler
- Twilio / Exotel call event webhook handler
- WhatsApp Cloud API webhook handler
- Input validation with Zod
- Role checks and activity logging
- In-memory fallback for demo mode if MongoDB is not configured

## Quick Start

1. Copy `.env.example` to `.env`
2. Install dependencies:
   - `npm install`
3. Start the API:
   - `npm run dev`
4. Default demo login:
   - `manager@nexuscrm.ai` / `demo123`
   - `sales@nexuscrm.ai` / `demo123`

## Key Endpoints

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/leads`
- `POST /api/leads`
- `PATCH /api/leads/:id`
- `POST /api/leads/:id/calls`
- `POST /api/leads/:id/messages`
- `POST /api/webhooks/meta-ads`
- `POST /api/webhooks/ivr`
- `POST /api/webhooks/whatsapp`
- `GET /api/integrations/status`

## Integration Notes

### Meta Ads
Add your Meta app access token and lead form webhook verification token in `.env`.

### WhatsApp Cloud API
Set `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, then create approved templates such as:
- `new_lead_welcome`
- `missed_call_followup`
- `followup_day_2`

### Calling / IVR
Use either Twilio or Exotel credentials. The sample implementation records call direction, duration, status, and optional recording URL.

## Suggested Frontend Connection

Point the React frontend to `http://localhost:4000/api` and attach the bearer token from `POST /api/auth/login` in the `Authorization` header.
