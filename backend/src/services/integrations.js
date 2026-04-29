const META_GRAPH_URL = 'https://graph.facebook.com/v22.0'
const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com/v22.0'

export function getIntegrationStatus() {
  return {
    metaAds: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
    whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    calling: Boolean(
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ||
        (process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN)
    ),
  }
}

export async function sendWhatsAppTemplate({ to, templateName, variables = [] }) {
  const enabled = Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)

  if (!enabled) {
    return {
      sent: false,
      provider: 'whatsapp-cloud-api',
      reason: 'WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured',
    }
  }

  const response = await fetch(
    `${WHATSAPP_GRAPH_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: variables.length
            ? [
                {
                  type: 'body',
                  parameters: variables.map((value) => ({ type: 'text', text: value })),
                },
              ]
            : [],
        },
      }),
    }
  )

  const data = await response.json()
  return { sent: response.ok, provider: 'whatsapp-cloud-api', data }
}

export async function triggerClickToCall({ to, leadId }) {
  const twilioEnabled = Boolean(
    process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER
  )
  const exotelEnabled = Boolean(process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN)

  if (!twilioEnabled && !exotelEnabled) {
    return {
      queued: false,
      provider: 'demo',
      reason: 'No IVR provider credentials configured',
    }
  }

  return {
    queued: true,
    provider: twilioEnabled ? 'twilio' : 'exotel',
    leadId,
    destination: to,
  }
}

export async function fetchMetaLead(leadgenId) {
  if (!process.env.META_ACCESS_TOKEN) {
    return {
      id: leadgenId,
      full_name: 'Meta Lead Prospect',
      phone_number: '+1-555-1000',
      email: 'meta@example.com',
      source: 'meta_ads',
    }
  }

  const response = await fetch(`${META_GRAPH_URL}/${leadgenId}?access_token=${process.env.META_ACCESS_TOKEN}`)
  const data = await response.json()
  return data
}

export async function transcribeRecording(recordingUrl) {
  return {
    enabled: false,
    recordingUrl,
    summary: 'AI transcription hook ready. Connect Whisper or another STT provider here.',
  }
}
