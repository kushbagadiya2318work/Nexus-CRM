import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import cookieParser from 'cookie-parser'
import mongoose from 'mongoose'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { ActivityLog } from './models/index.js'
import { fetchMetaLead, getIntegrationStatus, sendWhatsAppTemplate, transcribeRecording, triggerClickToCall } from './services/integrations.js'

const app = express()
const PORT = Number(process.env.PORT || 4000)
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret'

const demoUsers = [
  {
    id: 'u1',
    name: 'Sarah Chen',
    email: 'manager@nexuscrm.ai',
    passwordHash: bcrypt.hashSync('demo123', 10),
    role: 'manager',
    status: 'active',
    department: 'enterprise',
    skills: ['enterprise', 'closing', 'strategy'],
    maxActiveLeads: 6,
    isAvailable: true,
  },
  {
    id: 'u2',
    name: 'Mike Ross',
    email: 'sales@nexuscrm.ai',
    passwordHash: bcrypt.hashSync('demo123', 10),
    role: 'sales',
    status: 'active',
    department: 'inbound',
    skills: ['meta_ads', 'whatsapp', 'demo'],
    maxActiveLeads: 5,
    isAvailable: true,
  },
  {
    id: 'u3',
    name: 'Emma Davis',
    email: 'emma@nexuscrm.ai',
    passwordHash: bcrypt.hashSync('demo123', 10),
    role: 'sales',
    status: 'active',
    department: 'outbound',
    skills: ['ivr', 'email', 'follow_up'],
    maxActiveLeads: 4,
    isAvailable: true,
  },
]

const store = {
  leads: [
    {
      id: 'lead-1',
      name: 'Robert Johnson',
      phone: '+15550123',
      email: 'robert@techcorp.com',
      company: 'TechCorp Industries',
      source: 'meta_ads',
      status: 'new',
      assignedTo: 'u2',
      assignedUserName: 'Mike Ross',
      score: 91,
      value: 125000,
      notes: 'Captured via Meta lead form and auto-assigned.',
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      lastContacted: new Date().toISOString(),
      priority: 'high',
      tags: ['meta_ads', 'hot'],
      nextFollowUp: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
      callLogs: [],
      messages: [],
      timeline: [],
      automation: { autoAssigned: true, lastWorkflow: 'new-lead-welcome', chatbotEnabled: true },
    },
  ],
  clients: [
    {
      id: 'client-seed-1',
      name: 'William Taylor',
      email: 'william@enterprise.com',
      phone: '+15551111',
      company: 'Enterprise Solutions Inc',
      industry: 'Technology',
      status: 'active',
      lifetimeValue: 450000,
      totalDeals: 5,
      tags: ['enterprise', 'vip'],
      lastContact: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    },
  ],
  calls: [],
  messages: [],
  activities: [],
  refreshTokens: new Set(),
}

let roundRobinIndex = 0

app.use(helmet())
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json({ limit: '2mb' }))
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(morgan('dev'))

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

const leadPayloadSchema = z.object({
  name: z.string().min(2),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  company: z.string().optional(),
  source: z.enum(['manual', 'meta_ads', 'api', 'whatsapp', 'ivr', 'website', 'referral', 'linkedin', 'email', 'event', 'other']).default('manual'),
  status: z.enum(['new', 'contacted', 'interested', 'not_interested', 'converted']).optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  nextFollowUp: z.string().optional(),
  department: z.string().optional(),
  requiredSkill: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
})

const leadSchema = leadPayloadSchema.refine((value) => Boolean(value.phone || value.email), {
  message: 'At least phone or email is required',
  path: ['phone'],
})

const updateLeadSchema = leadPayloadSchema.partial()

const callSchema = z.object({
  provider: z.enum(['twilio', 'exotel', 'manual']).default('manual'),
  direction: z.enum(['inbound', 'outbound']).default('outbound'),
  status: z.enum(['answered', 'missed', 'failed']).default('answered'),
  duration: z.number().min(0).default(0),
  recordingUrl: z.string().url().optional(),
  notes: z.string().optional(),
})

const messageSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']).default('whatsapp'),
  direction: z.enum(['inbound', 'outbound']).default('outbound'),
  body: z.string().min(1),
  templateName: z.string().optional(),
  status: z.enum(['sent', 'delivered', 'read', 'failed']).default('sent'),
})

const clientUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'churned']).optional(),
  accountOwnerId: z.string().optional(),
  accountOwnerName: z.string().optional(),
  notes: z.string().optional(),
  healthScore: z.number().min(0).max(100).optional(),
  renewalDate: z.string().optional(),
  lastContact: z.string().optional(),
  lastContactChannel: z.enum(['call', 'whatsapp', 'email', 'note', 'system']).optional(),
}).partial()

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user
  return safeUser
}

function issueTokens(user) {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
  }

  const accessToken = jwt.sign(payload, ACCESS_SECRET, { expiresIn: '15m' })
  const refreshToken = jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' })
  store.refreshTokens.add(refreshToken)

  return { accessToken, refreshToken }
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ message: 'Missing bearer token' })
  }

  try {
    req.user = jwt.verify(token, ACCESS_SECRET)
    return next()
  } catch {
    return res.status(401).json({ message: 'Invalid or expired access token' })
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permission for this action' })
    }

    return next()
  }
}

function getActiveLeadLoad(userId) {
  return store.leads.filter((lead) => {
    return lead.assignedTo === userId && !['converted', 'won', 'lost', 'not_interested'].includes(lead.status)
  }).length
}

function selectAssignee({ assignedTo, requiredSkill, department } = {}) {
  if (assignedTo) {
    const matching = demoUsers.find((user) => user.id === assignedTo)
    if (matching) {
      return matching
    }
  }

  let pool = demoUsers.filter((user) => {
    return (user.role === 'sales' || user.role === 'manager') && user.status === 'active' && user.isAvailable !== false
  })

  if (department) {
    const departmentMatches = pool.filter((user) => user.department === department)
    if (departmentMatches.length) {
      pool = departmentMatches
    }
  }

  if (requiredSkill) {
    const skillMatches = pool.filter((user) =>
      user.skills?.some((skill) => skill.toLowerCase().includes(String(requiredSkill).toLowerCase()))
    )
    if (skillMatches.length) {
      pool = skillMatches
    }
  }

  const underCapacity = pool.filter((user) => getActiveLeadLoad(user.id) < (user.maxActiveLeads || Number.MAX_SAFE_INTEGER))
  if (underCapacity.length) {
    pool = underCapacity
  }

  const sortedByLoad = [...pool].sort((a, b) => getActiveLeadLoad(a.id) - getActiveLeadLoad(b.id))
  const lowestLoad = getActiveLeadLoad(sortedByLoad[0]?.id)
  const tiedUsers = sortedByLoad.filter((user) => getActiveLeadLoad(user.id) === lowestLoad)
  const selected = tiedUsers[roundRobinIndex % Math.max(1, tiedUsers.length)] || sortedByLoad[0] || demoUsers[0]

  roundRobinIndex += 1
  return selected
}

function appendTimeline(lead, entry) {
  lead.timeline = lead.timeline || []
  lead.timeline.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), ...entry })
}

async function writeActivity(action, entityType, entityId, metadata = {}, actor = null) {
  const entry = {
    id: randomUUID(),
    action,
    entityType,
    entityId,
    metadata,
    actorId: actor?.sub || actor?.id || 'system',
    actorName: actor?.name || 'System',
    createdAt: new Date().toISOString(),
  }

  store.activities.unshift(entry)

  if (mongoose.connection.readyState === 1) {
    try {
      await ActivityLog.create(entry)
    } catch (error) {
      console.warn('Activity log persistence skipped:', error.message)
    }
  }
}

function findLead(leadId) {
  return store.leads.find((lead) => lead.id === leadId)
}

function normalizePhone(value = '') {
  return String(value).replace(/\D/g, '')
}

function findLeadByPhone(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return null
  }

  return store.leads.find((lead) => normalizePhone(lead.phone) === normalized) || null
}

function findClient(clientId) {
  return store.clients.find((client) => client.id === clientId)
}

function createClientFromLead(lead) {
  return {
    id: `client-${lead.id}`,
    name: lead.name,
    email: lead.email || `${lead.id}@client.local`,
    phone: lead.phone,
    company: lead.company,
    industry: lead.department || 'General',
    status: 'active',
    lifetimeValue: lead.value || 0,
    totalDeals: 1,
    tags: Array.from(new Set([...(lead.tags || []), 'converted'])),
    notes: `Created automatically from converted lead ${lead.name}.`,
    lastContact: lead.lastContacted || lead.lastActivity || new Date().toISOString(),
    createdAt: lead.createdAt || new Date().toISOString(),
  }
}

function ensureClientFromLead(lead) {
  if (!lead || !['converted', 'won'].includes(lead.status)) {
    return null
  }

  const existing = store.clients.find((client) => {
    return client.email?.toLowerCase() === lead.email?.toLowerCase() ||
      client.company?.toLowerCase() === lead.company?.toLowerCase() ||
      (normalizePhone(client.phone) !== '' && normalizePhone(client.phone) === normalizePhone(lead.phone))
  })

  if (existing) {
    return existing
  }

  const client = createClientFromLead(lead)
  store.clients.unshift(client)

  appendTimeline(lead, {
    type: 'system',
    title: 'Client profile created',
    description: 'This lead was converted and added to the client database automatically.',
  })

  return client
}

async function createLead(payload, actor = null) {
  const assignee = selectAssignee(payload)
  const now = new Date().toISOString()
  const parsedTags = Array.isArray(payload.tags)
    ? payload.tags
    : String(payload.tags || '')
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)

  const lead = {
    id: randomUUID(),
    name: payload.name,
    phone: payload.phone || '',
    email: payload.email || '',
    company: payload.company || 'Independent',
    source: payload.source || 'manual',
    status: payload.status || 'new',
    assignedTo: assignee.id,
    assignedUserName: assignee.name,
    department: payload.department || assignee.department,
    requiredSkill: payload.requiredSkill,
    score: payload.priority === 'high' ? 88 : payload.source === 'meta_ads' ? 90 : 72,
    value: payload.source === 'meta_ads' ? 50000 : 25000,
    notes: payload.notes || 'Lead captured via CRM API.',
    priority: payload.priority || 'medium',
    tags: parsedTags,
    lastActivity: now,
    createdAt: now,
    lastContacted: now,
    nextFollowUp: payload.nextFollowUp || new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    callLogs: [],
    messages: [],
    timeline: [],
    automation: {
      autoAssigned: true,
      lastWorkflow: 'new-lead-welcome',
      chatbotEnabled: true,
    },
  }

  appendTimeline(lead, {
    type: 'system',
    title: 'Lead created',
    description: `Lead was added from ${lead.source} and assigned to ${assignee.name}.`,
  })

  store.leads.unshift(lead)
  await writeActivity('lead.created', 'lead', lead.id, { source: lead.source }, actor)

  if (lead.phone) {
    const whatsappResult = await sendWhatsAppTemplate({
      to: lead.phone.replace(/\D/g, ''),
      templateName: 'new_lead_welcome',
      variables: [lead.name],
    })

    lead.messages.unshift({
      id: randomUUID(),
      channel: 'whatsapp',
      direction: 'outbound',
      body: whatsappResult.sent
        ? `Welcome template sent to ${lead.name}.`
        : 'WhatsApp template queued. Complete Cloud API credentials to deliver messages.',
      templateName: 'new_lead_welcome',
      status: whatsappResult.sent ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
    })
  }

  ensureClientFromLead(lead)
  return lead
}

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'demo-fallback',
    integrations: getIntegrationStatus(),
  })
})

app.post('/api/auth/login', async (req, res, next) => {
  try {
    const { email, password } = authSchema.parse(req.body)
    const user = demoUsers.find((item) => item.email.toLowerCase() === email.toLowerCase())

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const tokens = issueTokens(user)
    await writeActivity('auth.login', 'auth', user.id, {}, user)

    return res.json({
      user: sanitizeUser(user),
      ...tokens,
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/auth/refresh', (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies.refreshToken

  if (!refreshToken || !store.refreshTokens.has(refreshToken)) {
    return res.status(401).json({ message: 'Missing or invalid refresh token' })
  }

  try {
    const payload = jwt.verify(refreshToken, REFRESH_SECRET)
    const accessToken = jwt.sign(
      {
        sub: payload.sub,
        email: payload.email,
        role: payload.role,
        name: payload.name,
      },
      ACCESS_SECRET,
      { expiresIn: '15m' }
    )

    return res.json({ accessToken })
  } catch {
    store.refreshTokens.delete(refreshToken)
    return res.status(401).json({ message: 'Refresh token expired' })
  }
})

app.post('/api/auth/logout', authenticate, (req, res) => {
  const refreshToken = req.body.refreshToken || req.cookies.refreshToken
  if (refreshToken) {
    store.refreshTokens.delete(refreshToken)
  }

  return res.json({ success: true })
})

app.get('/api/integrations/status', authenticate, (_req, res) => {
  res.json({ data: getIntegrationStatus() })
})

app.get('/api/clients', authenticate, (_req, res) => {
  res.json({ data: store.clients, total: store.clients.length })
})

app.get('/api/clients/:id', authenticate, (req, res) => {
  const client = findClient(req.params.id)

  if (!client) {
    return res.status(404).json({ message: 'Client not found' })
  }

  return res.json({ data: client })
})

app.patch('/api/clients/:id', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const client = findClient(req.params.id)
    if (!client) {
      return res.status(404).json({ message: 'Client not found' })
    }

    const updates = clientUpdateSchema.parse(req.body)
    Object.assign(client, updates, { lastContact: updates.lastContact || new Date().toISOString() })

    client.timeline = client.timeline || []
    client.timeline.unshift({
      id: randomUUID(),
      type: 'status',
      title: 'Client updated',
      description: 'Client profile was updated from the CRM.',
      timestamp: new Date().toISOString(),
    })

    await writeActivity('client.updated', 'client', client.id, updates, req.user)
    return res.json({ data: client })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/clients/:id/calls', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const client = findClient(req.params.id)
    if (!client) {
      return res.status(404).json({ message: 'Client not found' })
    }

    const payload = callSchema.parse(req.body)
    const call = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload,
    }

    client.callLogs = client.callLogs || []
    client.timeline = client.timeline || []
    client.callLogs.unshift(call)
    client.timeline.unshift({
      id: randomUUID(),
      type: 'call',
      title: 'Client call logged',
      description: `Call ${payload.status} via ${payload.provider}. Duration: ${payload.duration}s.`,
      timestamp: call.timestamp,
    })
    client.lastContact = call.timestamp
    client.lastContactChannel = 'call'

    await writeActivity('client.call.logged', 'client', client.id, payload, req.user)
    return res.status(201).json({ data: call })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/clients/:id/messages', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const client = findClient(req.params.id)
    if (!client) {
      return res.status(404).json({ message: 'Client not found' })
    }

    const payload = messageSchema.parse(req.body)
    const message = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload,
    }

    client.messages = client.messages || []
    client.timeline = client.timeline || []
    client.messages.unshift(message)
    client.timeline.unshift({
      id: randomUUID(),
      type: 'message',
      title: 'Client message logged',
      description: payload.body,
      timestamp: message.timestamp,
    })
    client.lastContact = message.timestamp
    client.lastContactChannel = payload.channel === 'whatsapp' ? 'whatsapp' : 'email'

    await writeActivity('client.message.logged', 'client', client.id, payload, req.user)
    return res.status(201).json({ data: message })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/leads', authenticate, (req, res) => {
  const { status, source, assignedTo, q } = req.query

  const data = store.leads.filter((lead) => {
    const matchesStatus = !status || lead.status === status
    const matchesSource = !source || lead.source === source
    const matchesAssigned = !assignedTo || lead.assignedTo === assignedTo
    const search = String(q || '').toLowerCase()
    const matchesQuery =
      !search ||
      lead.name.toLowerCase().includes(search) ||
      lead.email.toLowerCase().includes(search) ||
      lead.phone.toLowerCase().includes(search) ||
      lead.company.toLowerCase().includes(search)

    return matchesStatus && matchesSource && matchesAssigned && matchesQuery
  })

  res.json({ data, total: data.length })
})

app.post('/api/leads', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const payload = leadSchema.parse(req.body)
    const lead = await createLead(payload, req.user)
    return res.status(201).json({ data: lead })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/leads/:id', authenticate, (req, res) => {
  const lead = findLead(req.params.id)

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' })
  }

  return res.json({ data: lead })
})

app.patch('/api/leads/:id', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const lead = findLead(req.params.id)
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' })
    }

    const updates = updateLeadSchema.parse(req.body)
    Object.assign(lead, updates, { lastActivity: new Date().toISOString() })

    appendTimeline(lead, {
      type: 'status',
      title: 'Lead updated',
      description: 'Lead profile or stage was updated from the CRM.',
    })

    const client = ensureClientFromLead(lead)

    await writeActivity('lead.updated', 'lead', lead.id, updates, req.user)
    return res.json({ data: lead, client })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/leads/:id/timeline', authenticate, (req, res) => {
  const lead = findLead(req.params.id)

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' })
  }

  return res.json({ data: lead.timeline || [] })
})

app.post('/api/leads/:id/calls', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const lead = findLead(req.params.id)
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' })
    }

    const payload = callSchema.parse(req.body)
    const call = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload,
    }

    lead.callLogs.unshift(call)
    lead.lastActivity = call.timestamp
    lead.lastContacted = call.timestamp
    lead.lastContactChannel = 'call'
    store.calls.unshift({ leadId: lead.id, leadName: lead.name, ...call })

    const callProviderResult = await triggerClickToCall({
      to: lead.phone,
      leadId: lead.id,
    })

    appendTimeline(lead, {
      type: 'call',
      title: payload.status === 'missed' ? 'Missed call logged' : 'Call logged',
      description: `Call ${payload.status} via ${payload.provider}. Duration: ${payload.duration}s.`,
    })

    if (payload.recordingUrl) {
      lead.aiSummary = (await transcribeRecording(payload.recordingUrl)).summary
    }

    if (payload.status === 'missed' && lead.phone) {
      await sendWhatsAppTemplate({
        to: lead.phone.replace(/\D/g, ''),
        templateName: 'missed_call_followup',
        variables: [lead.name],
      })
    }

    await writeActivity('call.logged', 'call', call.id, { leadId: lead.id, provider: payload.provider }, req.user)

    return res.status(201).json({ data: call, integration: callProviderResult })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/leads/:id/messages', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const lead = findLead(req.params.id)
    if (!lead) {
      return res.status(404).json({ message: 'Lead not found' })
    }

    const payload = messageSchema.parse(req.body)
    const message = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload,
    }

    lead.messages.unshift(message)
    lead.lastActivity = message.timestamp
    lead.lastContacted = message.timestamp
    lead.lastContactChannel = payload.channel === 'whatsapp' ? 'whatsapp' : 'email'
    store.messages.unshift({ leadId: lead.id, leadName: lead.name, ...message })

    appendTimeline(lead, {
      type: 'message',
      title: 'Message logged',
      description: payload.body,
    })

    await writeActivity('message.logged', 'message', message.id, { leadId: lead.id, channel: payload.channel }, req.user)

    return res.status(201).json({ data: message })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/calls', authenticate, (_req, res) => {
  res.json({ data: store.calls, total: store.calls.length })
})

app.get('/api/messages', authenticate, (_req, res) => {
  res.json({ data: store.messages, total: store.messages.length })
})

app.get('/api/webhooks/meta-ads', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge)
  }

  return res.status(403).send('Verification failed')
})

app.post('/api/webhooks/meta-ads', async (req, res, next) => {
  try {
    const leadgenId = req.body.leadgen_id || req.body.entry?.[0]?.changes?.[0]?.value?.leadgen_id
    const externalLead = leadgenId ? await fetchMetaLead(leadgenId) : req.body

    const lead = await createLead(
      {
        name: externalLead.full_name || externalLead.name || 'Meta Ads Lead',
        phone: externalLead.phone_number || externalLead.phone,
        email: externalLead.email,
        company: externalLead.company_name || 'Facebook Lead',
        notes: 'Captured automatically from Meta Ads webhook.',
        source: 'meta_ads',
        department: 'inbound',
        requiredSkill: 'meta_ads',
        priority: 'high',
        tags: ['meta_ads', 'auto-captured'],
      },
      null
    )

    return res.status(201).json({ received: true, leadId: lead.id })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/webhooks/ivr', async (req, res, next) => {
  try {
    let lead = findLead(req.body.leadId) || findLeadByPhone(req.body.from || req.body.phone)

    if (!lead) {
      lead = await createLead(
        {
          name: req.body.name || `Caller ${req.body.from || req.body.phone || 'Unknown'}`,
          phone: req.body.from || req.body.phone,
          email: req.body.email,
          company: req.body.company || 'Inbound IVR Lead',
          source: 'ivr',
          notes: 'Lead auto-created from inbound IVR/calling webhook.',
          department: 'outbound',
          requiredSkill: 'ivr',
          priority: 'high',
          tags: ['ivr', 'auto-created'],
        },
        null
      )
    }

    const payload = callSchema.parse({
      provider: req.body.provider || 'twilio',
      direction: req.body.direction || 'inbound',
      status: req.body.status || 'answered',
      duration: Number(req.body.duration || 0),
      recordingUrl: req.body.recordingUrl,
      notes: req.body.notes,
    })

    const call = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...payload,
    }

    lead.callLogs.unshift(call)
    store.calls.unshift({ leadId: lead.id, leadName: lead.name, ...call })
    appendTimeline(lead, {
      type: 'call',
      title: 'IVR event received',
      description: `Webhook updated the lead after a ${payload.status} ${payload.direction} call.`,
    })

    if (payload.status === 'missed' && lead.phone) {
      await sendWhatsAppTemplate({
        to: lead.phone.replace(/\D/g, ''),
        templateName: 'missed_call_followup',
        variables: [lead.name],
      })
    }

    return res.json({ received: true, callId: call.id })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge)
  }

  return res.status(403).send('Verification failed')
})

app.post('/api/webhooks/whatsapp', async (req, res, next) => {
  try {
    let lead = findLead(req.body.leadId) || findLeadByPhone(req.body.from || req.body.phone)

    if (!lead) {
      lead = await createLead(
        {
          name: req.body.name || `WhatsApp ${req.body.from || req.body.phone || 'Lead'}`,
          phone: req.body.from || req.body.phone,
          email: req.body.email,
          company: req.body.company || 'WhatsApp Inquiry',
          source: 'whatsapp',
          notes: 'Lead auto-created from inbound WhatsApp message.',
          department: 'inbound',
          requiredSkill: 'whatsapp',
          priority: 'high',
          tags: ['whatsapp', 'auto-created'],
        },
        null
      )
    }

    const message = {
      id: randomUUID(),
      channel: 'whatsapp',
      direction: req.body.direction || 'inbound',
      body: req.body.body || 'Incoming WhatsApp event received.',
      status: req.body.status || 'delivered',
      timestamp: new Date().toISOString(),
    }

    lead.messages.unshift(message)
    store.messages.unshift({ leadId: lead.id, leadName: lead.name, ...message })
    appendTimeline(lead, {
      type: 'message',
      title: 'WhatsApp event received',
      description: message.body,
    })

    return res.json({ received: true, messageId: message.id, leadId: lead.id })
  } catch (error) {
    return next(error)
  }
})

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ message: 'Validation failed', issues: error.issues })
  }

  console.error(error)
  return res.status(500).json({ message: 'Internal server error' })
})

async function connectMongo() {
  if (!process.env.MONGO_URI) {
    console.warn('No MONGO_URI provided. Running in demo fallback mode.')
    return
  }

  try {
    await mongoose.connect(process.env.MONGO_URI)
    console.log('MongoDB connected')
  } catch (error) {
    console.warn('MongoDB connection failed. Continuing in demo fallback mode.')
    console.warn(error.message)
  }
}

connectMongo().then(() => {
  app.listen(PORT, () => {
    console.log(`Lead management API listening on http://localhost:${PORT}`)
  })
})
