const META_GRAPH_URL = 'https://graph.facebook.com/v22.0'
const WHATSAPP_GRAPH_URL = 'https://graph.facebook.com/v22.0'

export function getIntegrationStatus() {
  return {
    metaAds: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
    whatsapp: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
    email: Boolean(process.env.LEAD_EMAIL_WEBHOOK_URL || process.env.RESEND_API_KEY || process.env.SMTP_HOST),
    slack: Boolean(process.env.SLACK_WEBHOOK_URL),
    sync: Boolean(process.env.ZAPIER_WEBHOOK_URL || process.env.MAKE_WEBHOOK_URL),
    calling: Boolean(
      (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) ||
        (process.env.EXOTEL_API_KEY && process.env.EXOTEL_API_TOKEN)
    ),
  }
}

export async function sendEmailMessage({ to, subject, body, leadId }) {
  const webhookUrl = process.env.LEAD_EMAIL_WEBHOOK_URL

  if (!webhookUrl) {
    return {
      sent: false,
      provider: 'webhook',
      reason: 'LEAD_EMAIL_WEBHOOK_URL not configured',
    }
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, body, leadId }),
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  return { sent: response.ok, provider: 'webhook', data }
}

export async function sendSmsMessage({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER

  if (!sid || !token || !from) {
    return {
      sent: false,
      provider: 'twilio',
      reason: 'Twilio SMS credentials not configured',
    }
  }

  const formBody = new URLSearchParams({ To: to, From: from, Body: body }).toString()
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody,
  })

  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }

  return { sent: response.ok, provider: 'twilio', data }
}

export async function notifySlack({ text, blocks }) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    return { sent: false, provider: 'slack', reason: 'SLACK_WEBHOOK_URL not configured' }
  }

  const response = await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, blocks }),
  })

  return { sent: response.ok, provider: 'slack' }
}

export async function syncLeadToAutomationPlatforms(payload) {
  const targets = [
    { provider: 'zapier', url: process.env.ZAPIER_WEBHOOK_URL },
    { provider: 'make', url: process.env.MAKE_WEBHOOK_URL },
  ].filter((target) => target.url)

  if (!targets.length) {
    return []
  }

  return Promise.all(
    targets.map(async (target) => {
      const response = await fetch(target.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      return { provider: target.provider, sent: response.ok }
    })
  )
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
