// AI assistant service.
//
// Uses the OpenAI Chat Completions API when `OPENAI_API_KEY` is set. Falls
// back to a deterministic local reply otherwise so the endpoint never crashes
// in unconfigured environments.

const DEFAULT_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

export function aiStatus() {
  return {
    enabled: Boolean(process.env.OPENAI_API_KEY),
    provider: process.env.OPENAI_API_KEY ? 'openai' : 'stub',
    model: process.env.OPENAI_API_KEY ? DEFAULT_MODEL : null,
  }
}

function buildSystemPrompt(user, context) {
  const lines = [
    'You are Nexus CRM, an assistant embedded inside a sales CRM.',
    'Be concise, action-oriented, and reference CRM entities (leads, deals, tasks) when relevant.',
  ]
  if (user?.name) lines.push(`The current user is ${user.name} (${user.role || 'user'}).`)
  if (context && Object.keys(context).length) {
    lines.push(`Context: ${JSON.stringify(context).slice(0, 1500)}`)
  }
  return lines.join('\n')
}

async function callOpenAI({ message, history, system }) {
  const messages = [
    { role: 'system', content: system },
    ...(history || []).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ]

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.4,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const err = new Error(`OpenAI request failed (${response.status}): ${text.slice(0, 200)}`)
    err.statusCode = response.status === 401 ? 401 : 502
    throw err
  }
  const data = await response.json()
  const reply = data?.choices?.[0]?.message?.content?.trim() || ''
  return { reply, usage: data?.usage || null }
}

function stubReply(message) {
  return {
    reply:
      "AI assistant is not configured. Set OPENAI_API_KEY in the backend environment to enable live responses. " +
      `(You said: "${String(message).slice(0, 140)}")`,
    usage: null,
  }
}

export async function generateAiReply({ message, history = [], context = {}, user = null }) {
  const system = buildSystemPrompt(user, context)
  if (!process.env.OPENAI_API_KEY) {
    return { ...stubReply(message), provider: 'stub' }
  }
  const result = await callOpenAI({ message, history, system })
  return { ...result, provider: 'openai', model: DEFAULT_MODEL }
}
