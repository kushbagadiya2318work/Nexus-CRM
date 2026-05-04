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
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto'
import { ActivityLog, Client, Deal, Lead, PushSubscription, Task, User, Workflow, WorkflowExecution } from './models/index.js'
import {
  fetchMetaLead,
  getIntegrationStatus,
  notifySlack,
  sendEmailMessage,
  sendSmsMessage,
  sendWhatsAppTemplate,
  syncLeadToAutomationPlatforms,
  transcribeRecording,
  triggerClickToCall,
} from './services/integrations.js'
import { attachRealtime, broadcast as realtimeBroadcast, realtimeStatus } from './realtime.js'
import { rowsToCsv, parseCsv } from './utils/csv.js'
import { generateAiReply, aiStatus } from './services/ai.js'
import { initWebPush, pushStatus, sendPush } from './services/push.js'
import { triggerWorkflows } from './services/workflows.js'

const app = express()
const PORT = Number(process.env.PORT || 4000)
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret'

const store = {
  users: [],
  leads: [],
  clients: [],
  deals: [],
  tasks: [],
  calls: [],
  messages: [],
  activities: [],
  refreshTokens: new Set(),
}

let roundRobinIndex = 0

// Build a list of allowed CORS origins. In Vercel, the frontend lives on the
// same origin as the API so credentialed same-origin requests are allowed by
// default; explicit origins are still honoured for local development and any
// extra hosts configured via FRONTEND_URL (comma-separated).
const allowedOrigins = new Set(
  [
    process.env.FRONTEND_URL,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    'http://localhost:5173',
    'http://localhost:4173',
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(',').map((entry) => entry.trim()))
    .filter(Boolean)
)

app.use(helmet())
app.use(
  cors({
    origin(origin, callback) {
      // Allow same-origin / non-browser requests (no Origin header)
      if (!origin) return callback(null, true)
      if (allowedOrigins.has(origin)) return callback(null, true)
      return callback(null, false)
    },
    credentials: true,
  })
)
app.use(express.json({
  limit: '2mb',
  verify(req, _res, buf) {
    // Preserve raw body bytes for webhook signature verification.
    req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '')
  },
}))
app.use(express.urlencoded({
  extended: true,
  verify(req, _res, buf) {
    if (!req.rawBody) {
      req.rawBody = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || '')
    }
  },
}))
app.use(cookieParser())
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

// ---- Webhook signature verification ---------------------------------------

function safeEqual(a, b) {
  const ab = Buffer.from(a || '', 'utf8')
  const bb = Buffer.from(b || '', 'utf8')
  if (ab.length !== bb.length) return false
  try {
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

function verifyMetaSignature(req, _res, next) {
  const secret = process.env.META_APP_SECRET
  // If no secret configured, skip (dev mode) but warn.
  if (!secret) {
    if (!global.__metaSecretWarned) {
      console.warn('META_APP_SECRET is not set. Meta webhook signatures are NOT being verified.')
      global.__metaSecretWarned = true
    }
    return next()
  }
  const header = req.get('x-hub-signature-256') || ''
  if (!header.startsWith('sha256=')) {
    return next({ statusCode: 401, message: 'Missing Meta webhook signature' })
  }
  const expected = createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest('hex')
  if (!safeEqual(header.slice(7), expected)) {
    return next({ statusCode: 401, message: 'Invalid Meta webhook signature' })
  }
  return next()
}

function verifyWhatsAppSignature(req, _res, next) {
  // WhatsApp Cloud API also uses x-hub-signature-256 with the App Secret.
  const secret = process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET
  if (!secret) {
    if (!global.__waSecretWarned) {
      console.warn('WHATSAPP_APP_SECRET is not set. WhatsApp webhook signatures are NOT being verified.')
      global.__waSecretWarned = true
    }
    return next()
  }
  const header = req.get('x-hub-signature-256') || ''
  if (!header.startsWith('sha256=')) {
    return next({ statusCode: 401, message: 'Missing WhatsApp webhook signature' })
  }
  const expected = createHmac('sha256', secret).update(req.rawBody || Buffer.alloc(0)).digest('hex')
  if (!safeEqual(header.slice(7), expected)) {
    return next({ statusCode: 401, message: 'Invalid WhatsApp webhook signature' })
  }
  return next()
}

function verifyTwilioSignature(req, _res, next) {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) {
    if (!global.__twilioSecretWarned) {
      console.warn('TWILIO_AUTH_TOKEN is not set. Twilio webhook signatures are NOT being verified.')
      global.__twilioSecretWarned = true
    }
    return next()
  }
  // Twilio computes HMAC-SHA1 over (URL + sorted form params concatenated).
  const provided = req.get('x-twilio-signature') || ''
  if (!provided) {
    return next({ statusCode: 401, message: 'Missing Twilio signature' })
  }
  const proto = req.get('x-forwarded-proto') || req.protocol
  const host = req.get('x-forwarded-host') || req.get('host')
  const url = `${proto}://${host}${req.originalUrl}`
  const params = req.body && typeof req.body === 'object' ? req.body : {}
  const sortedKeys = Object.keys(params).sort()
  const data = url + sortedKeys.map((key) => `${key}${params[key]}`).join('')
  const expected = createHmac('sha1', token).update(data).digest('base64')
  if (!safeEqual(provided, expected)) {
    return next({ statusCode: 401, message: 'Invalid Twilio signature' })
  }
  return next()
}

// Generic shared-secret verifier (for Exotel/Zapier/Make/Slack inbound).
function verifySharedSecret(headerName, envVar) {
  return (req, _res, next) => {
    const expected = process.env[envVar]
    if (!expected) return next() // not configured -> skip
    const provided = req.get(headerName) || req.query.token || req.body?.token
    if (!safeEqual(String(provided || ''), expected)) {
      return next({ statusCode: 401, message: `Invalid ${headerName} signature` })
    }
    return next()
  }
}

// ---- Rate limiting --------------------------------------------------------
// Lightweight in-memory sliding-window limiter. Acceptable as per-instance
// soft protection. For production scale, place a global limiter (Cloudflare,
// API gateway, or Redis-backed) in front of the API.

const rateBuckets = new Map()

function clientKey(req) {
  const fwd = req.get('x-forwarded-for')
  const ip = (fwd ? fwd.split(',')[0].trim() : null) || req.ip || req.socket?.remoteAddress || 'unknown'
  return ip
}

function rateLimit({ windowMs, max, scope = 'global', keyFn = clientKey }) {
  return (req, res, next) => {
    const key = `${scope}:${keyFn(req)}`
    const now = Date.now()
    const bucket = rateBuckets.get(key) || []
    // Drop entries outside the window
    while (bucket.length && bucket[0] <= now - windowMs) bucket.shift()
    if (bucket.length >= max) {
      const retryAfter = Math.ceil((bucket[0] + windowMs - now) / 1000)
      res.set('Retry-After', String(Math.max(1, retryAfter)))
      res.set('X-RateLimit-Limit', String(max))
      res.set('X-RateLimit-Remaining', '0')
      return res.status(429).json({ message: 'Too many requests. Please slow down.' })
    }
    bucket.push(now)
    rateBuckets.set(key, bucket)
    res.set('X-RateLimit-Limit', String(max))
    res.set('X-RateLimit-Remaining', String(Math.max(0, max - bucket.length)))
    return next()
  }
}

// Periodically prune empty buckets so the map doesn't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000
  for (const [key, bucket] of rateBuckets) {
    while (bucket.length && bucket[0] <= cutoff) bucket.shift()
    if (!bucket.length) rateBuckets.delete(key)
  }
}, 60 * 1000).unref?.()

const authRateLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, scope: 'auth' })
const captureRateLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, scope: 'capture' })
const webhookRateLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, scope: 'webhook' })

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
  status: z.enum(['new', 'contacted', 'interested', 'not_interested', 'converted', 'qualified', 'proposal', 'negotiation', 'won', 'lost']).optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  nextFollowUp: z.string().optional(),
  department: z.string().optional(),
  requiredSkill: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  budget: z.number().nonnegative().optional(),
  interestLevel: z.enum(['low', 'medium', 'high']).optional(),
  engagementLevel: z.enum(['low', 'medium', 'high']).optional(),
  preferredChannels: z.array(z.enum(['email', 'sms', 'whatsapp'])).optional(),
  location: z.object({
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    address: z.string().optional(),
  }).optional(),
  consent: z.object({
    termsAccepted: z.boolean().optional(),
    marketingOptIn: z.boolean().optional(),
    privacyAcceptedAt: z.string().optional(),
    captureMethod: z.string().optional(),
  }).optional(),
  sourceMeta: z.record(z.any()).optional(),
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

const clientPayloadSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().min(1),
  industry: z.string().optional(),
  address: z.string().optional(),
  website: z.string().optional(),
  status: z.enum(['active', 'inactive', 'churned']).default('active'),
  segment: z.enum(['startup', 'smb', 'enterprise', 'vip']).optional(),
  accountOwnerId: z.string().optional(),
  accountOwnerName: z.string().optional(),
  healthScore: z.number().min(0).max(100).optional(),
  renewalDate: z.string().optional(),
  lastContactChannel: z.enum(['call', 'whatsapp', 'email', 'note', 'system']).optional(),
  lifetimeValue: z.number().nonnegative().default(0),
  totalDeals: z.number().int().nonnegative().default(0),
  tags: z.array(z.string()).default([]),
  notes: z.string().optional(),
  lastContact: z.string().optional(),
  callLogs: z.array(z.any()).optional(),
  messages: z.array(z.any()).optional(),
  timeline: z.array(z.any()).optional(),
})

const dealPayloadSchema = z.object({
  name: z.string().min(1),
  clientId: z.string().optional(),
  clientName: z.string().min(1).default('Unassigned'),
  value: z.number().nonnegative(),
  stage: z.enum(['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost']).default('prospecting'),
  probability: z.number().min(0).max(100).default(20),
  expectedCloseDate: z.string(),
  actualCloseDate: z.string().optional(),
  assignedTo: z.string().optional(),
  description: z.string().optional(),
  activities: z.array(z.any()).default([]),
  stageMovedAt: z.string().optional(),
  lostReason: z.string().optional(),
  nextFollowUp: z.string().optional(),
  tags: z.array(z.string()).default([]),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  comments: z.array(z.any()).optional(),
})

const taskPayloadSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(['pending', 'in-progress', 'completed', 'cancelled']).default('pending'),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  dueDate: z.string(),
  assignedTo: z.string().optional(),
  relatedTo: z.object({
    type: z.enum(['lead', 'client', 'deal']),
    id: z.string(),
    name: z.string(),
  }).optional(),
  completedAt: z.string().optional(),
  overdueReason: z.string().optional(),
  overdueNotifiedAt: z.string().optional(),
  comments: z.array(z.any()).optional(),
})

function sanitizeUser(user) {
  const { passwordHash, ...safeUser } = user
  return safeUser
}

function serializeUser(record) {
  const user = plainify(record)
  if (!user) {
    return null
  }

  user.id = String(user._id || user.id)
  user.createdAt = user.createdAt || new Date().toISOString()
  user.lastActive = user.lastActive || user.updatedAt || user.createdAt
  delete user.passwordHash
  delete user._id
  delete user.__v
  return user
}

function issueTokens(user) {
  const payload = {
    sub: user.id || String(user._id),
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

function isMongoReady() {
  return mongoose.connection.readyState === 1
}

async function ensureBootstrapAdmin() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_PASSWORD
  if (!email || !password || !isMongoReady()) {
    return null
  }

  const existing = await User.findOne({ email: email.toLowerCase() })
  if (existing) {
    return serializeUser(existing)
  }

  const user = await User.create({
    name: process.env.ADMIN_NAME || 'CRM Admin',
    email: email.toLowerCase(),
    passwordHash: bcrypt.hashSync(password, 12),
    role: 'admin',
    status: 'active',
    department: 'enterprise',
    skills: ['admin'],
    maxActiveLeads: 100,
    isAvailable: true,
    lastActive: new Date(),
  })

  return serializeUser(user)
}

async function listUsers() {
  if (isMongoReady()) {
    await ensureBootstrapAdmin()
    const users = await User.find({ status: 'active' }).sort({ createdAt: 1 }).lean()
    return users.map(serializeUser)
  }

  return store.users
}

async function getActiveLeadLoad(userId) {
  if (isMongoReady()) {
    return Lead.countDocuments({
      assignedTo: userId,
      status: { $nin: ['converted', 'won', 'lost', 'not_interested'] },
    })
  }

  return store.leads.filter((lead) => {
    return lead.assignedTo === userId && !['converted', 'won', 'lost', 'not_interested'].includes(lead.status)
  }).length
}

async function selectAssignee({ assignedTo, requiredSkill, department } = {}) {
  const users = await listUsers()

  if (assignedTo) {
    const matching = users.find((user) => user.id === assignedTo)
    if (matching) {
      return matching
    }
  }

  let pool = users.filter((user) => {
    return (user.role === 'sales' || user.role === 'manager') && user.status === 'active' && user.isAvailable !== false
  })
  if (!pool.length) {
    pool = users.filter((user) => user.role === 'admin' && user.status === 'active')
  }

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

  const loadByUser = new Map()
  for (const user of pool) {
    loadByUser.set(user.id, await getActiveLeadLoad(user.id))
  }

  const underCapacity = pool.filter((user) => loadByUser.get(user.id) < (user.maxActiveLeads || Number.MAX_SAFE_INTEGER))
  if (underCapacity.length) {
    pool = underCapacity
  }

  const sortedByLoad = [...pool].sort((a, b) => (loadByUser.get(a.id) || 0) - (loadByUser.get(b.id) || 0))
  const lowestLoad = loadByUser.get(sortedByLoad[0]?.id)
  const tiedUsers = sortedByLoad.filter((user) => (loadByUser.get(user.id) || 0) === lowestLoad)
  const selected = tiedUsers[roundRobinIndex % Math.max(1, tiedUsers.length)] || sortedByLoad[0] || users[0]

  roundRobinIndex += 1
  return selected
}

function appendTimeline(lead, entry) {
  lead.timeline = lead.timeline || []
  lead.timeline.unshift({ id: randomUUID(), timestamp: new Date().toISOString(), ...entry })
}

function plainify(record) {
  if (!record) {
    return null
  }

  return JSON.parse(JSON.stringify(record))
}

function mapNestedCollection(items = []) {
  return items.map((item) => {
    const entry = plainify(item)
    if (!entry.id && entry._id) {
      entry.id = String(entry._id)
    }
    delete entry._id
    delete entry.__v
    return entry
  })
}

function serializeLead(record) {
  const lead = plainify(record)
  if (!lead) {
    return null
  }

  lead.id = String(lead._id || lead.id)
  lead.callLogs = mapNestedCollection(lead.callLogs)
  lead.messages = mapNestedCollection(lead.messages)
  lead.timeline = mapNestedCollection(lead.timeline)
  if (lead.automation?.followUpSequence) {
    lead.automation.followUpSequence = mapNestedCollection(lead.automation.followUpSequence)
  }
  delete lead._id
  delete lead.__v
  return lead
}

function serializeClient(record) {
  const client = plainify(record)
  if (!client) {
    return null
  }

  client.id = String(client._id || client.id)
  client.callLogs = mapNestedCollection(client.callLogs)
  client.messages = mapNestedCollection(client.messages)
  client.timeline = mapNestedCollection(client.timeline)
  delete client._id
  delete client.__v
  return client
}

function serializeRecord(record) {
  const item = plainify(record)
  if (!item) {
    return null
  }

  item.id = String(item._id || item.id)
  delete item._id
  delete item.__v
  return item
}

function parseTags(value) {
  if (Array.isArray(value)) {
    return value.map((tag) => String(tag).trim()).filter(Boolean)
  }

  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
}

function computeLeadScore(payload) {
  const sourceWeights = {
    meta_ads: 28,
    whatsapp: 24,
    linkedin: 22,
    website: 20,
    referral: 26,
    ivr: 21,
    manual: 12,
    email: 14,
    api: 16,
    event: 18,
    other: 10,
  }
  const levelWeights = { low: 6, medium: 15, high: 28 }

  let score = 20
  score += sourceWeights[payload.source || 'other'] || 10
  score += payload.budget ? Math.min(20, Math.round(payload.budget / 5000)) : 0
  score += levelWeights[payload.interestLevel || 'medium']
  score += levelWeights[payload.engagementLevel || 'medium']
  score += payload.consent?.marketingOptIn ? 4 : 0
  score += payload.email ? 3 : 0
  score += payload.phone ? 3 : 0

  return Math.max(1, Math.min(100, score))
}

function deriveSegment(score) {
  if (score >= 85) return 'hot'
  if (score >= 60) return 'warm'
  return 'cold'
}

function derivePriority(payload, segment) {
  if (payload.priority) {
    return payload.priority
  }
  if (segment === 'hot') return 'high'
  if (segment === 'warm') return 'medium'
  return 'low'
}

function leadScoreVariant(score) {
  return score >= 85 ? 'A' : score >= 60 ? 'B' : 'C'
}

function buildLeadTags(payload, segment, baseTags) {
  const tags = new Set(baseTags)
  tags.add(payload.source || 'manual')
  tags.add(segment)
  if (payload.interestLevel) tags.add(`interest:${payload.interestLevel}`)
  if (payload.location?.city) tags.add(`city:${payload.location.city.toLowerCase()}`)
  if (payload.location?.country) tags.add(`country:${payload.location.country.toLowerCase()}`)
  return [...tags]
}

function buildFollowUpSequence(lead, preferredChannels = []) {
  const channels = preferredChannels.length
    ? preferredChannels
    : lead.phone
      ? ['whatsapp', 'email', 'sms']
      : ['email']

  const steps = [
    { dayOffset: 0, channel: channels[0] || 'email', templateName: 'instant_response', message: `Hi ${lead.name}, thanks for reaching out. We have received your inquiry.` },
    { dayOffset: 3, channel: channels[1] || channels[0] || 'email', templateName: 'day_3_followup', message: `Hi ${lead.name}, following up in case you want pricing, case studies, or a quick demo.` },
    { dayOffset: 7, channel: channels[2] || channels[0] || 'email', templateName: 'day_7_followup', message: `Hi ${lead.name}, sharing one last follow-up. We can help you with a tailored solution when you're ready.` },
  ]

  return steps.map((step) => ({
    id: randomUUID(),
    ...step,
    status: 'pending',
    scheduledFor: new Date(Date.now() + step.dayOffset * 24 * 60 * 60 * 1000).toISOString(),
  }))
}

async function maybeNotifyHotLead(lead) {
  if (lead.segment !== 'hot') {
    return null
  }

  return notifySlack({
    text: `Hot lead captured: ${lead.name} (${lead.company}) from ${lead.source}. Assigned to ${lead.assignedUserName}.`,
  })
}

async function runInitialOutreach(lead) {
  const sequence = lead.automation?.followUpSequence || []
  const step = sequence[0]
  const results = []

  if (!step) {
    return results
  }

  if (step.channel === 'whatsapp' && lead.phone) {
    const result = await sendWhatsAppTemplate({
      to: lead.phone.replace(/\D/g, ''),
      templateName: step.templateName || 'new_lead_welcome',
      variables: [lead.name],
    })
    results.push({ channel: 'whatsapp', ...result, body: step.message })
  } else if (step.channel === 'sms' && lead.phone) {
    const result = await sendSmsMessage({ to: lead.phone, body: step.message })
    results.push({ channel: 'sms', ...result, body: step.message })
  } else if (lead.email) {
    const result = await sendEmailMessage({
      to: lead.email,
      subject: 'Thanks for contacting us',
      body: step.message,
      leadId: lead.id,
    })
    results.push({ channel: 'email', ...result, body: step.message })
  }

  return results
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

  // Push to all connected websocket clients (best-effort, non-blocking).
  try {
    realtimeBroadcast('activity', entry, { exceptUserId: entry.actorId })
    realtimeBroadcast(`${entityType}.${action.split('.').pop()}`, { id: entityId, metadata, actorId: entry.actorId })
  } catch {
    // ignore broadcast errors
  }

  // Fire workflow engine for lead/deal/task events (best-effort).
  if (['lead', 'deal', 'task'].includes(entityType)) {
    try {
      let entity = null
      if (entityType === 'lead') entity = await findLeadFull(entityId)
      else if (entityType === 'deal') entity = await findDealFull(entityId)
      else if (entityType === 'task') entity = await findTaskFull(entityId)
      if (entity) {
        triggerWorkflows(
          { type: action, entityType },
          entity,
          { id: entry.actorId, name: entry.actorName }
        ).catch((err) => console.warn('[workflow] trigger failed', err?.message))
      }
    } catch (error) {
      console.warn('[workflow] resolve entity failed', error?.message)
    }
  }
}

async function findLeadFull(id) {
  if (isMongoReady()) {
    const doc = await Lead.findById(id).lean()
    return doc ? { ...doc, id: String(doc._id) } : null
  }
  return store.leads.find((l) => l.id === id) || null
}

async function findDealFull(id) {
  if (isMongoReady()) {
    const doc = await Deal.findById(id).lean()
    return doc ? { ...doc, id: String(doc._id) } : null
  }
  return store.deals.find((d) => d.id === id) || null
}

async function findTaskFull(id) {
  if (isMongoReady()) {
    const doc = await Task.findById(id).lean()
    return doc ? { ...doc, id: String(doc._id) } : null
  }
  return store.tasks.find((t) => t.id === id) || null
}

async function findLead(leadId) {
  if (isMongoReady()) {
    const lead = await Lead.findById(leadId)
    return serializeLead(lead)
  }

  return store.leads.find((lead) => lead.id === leadId) || null
}

function normalizePhone(value = '') {
  return String(value).replace(/\D/g, '')
}

async function findLeadByPhone(phone) {
  const normalized = normalizePhone(phone)
  if (!normalized) {
    return null
  }

  if (isMongoReady()) {
    const leads = await Lead.find({ phone: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).lean()
    const match = leads.find((lead) => normalizePhone(lead.phone) === normalized)
    return serializeLead(match)
  }

  return store.leads.find((lead) => normalizePhone(lead.phone) === normalized) || null
}

async function findLeadByIdentity({ phone, email }) {
  if (isMongoReady()) {
    const conditions = []
    if (email) {
      conditions.push({ email: String(email).toLowerCase() })
    }
    const normalizedPhone = normalizePhone(phone)
    if (normalizedPhone) {
      const mongoLeads = await Lead.find({ phone: { $exists: true, $ne: null } }).sort({ createdAt: -1 }).lean()
      const phoneMatch = mongoLeads.find((lead) => normalizePhone(lead.phone) === normalizedPhone)
      if (phoneMatch) {
        return serializeLead(phoneMatch)
      }
    }
    if (conditions.length) {
      const record = await Lead.findOne({ $or: conditions })
      return serializeLead(record)
    }
    return null
  }

  return store.leads.find((lead) =>
    (email && lead.email?.toLowerCase() === String(email).toLowerCase()) ||
    (phone && normalizePhone(lead.phone) === normalizePhone(phone))
  ) || null
}

async function findClient(clientId) {
  if (isMongoReady()) {
    const client = await Client.findById(clientId)
    return serializeClient(client)
  }

  return store.clients.find((client) => client.id === clientId) || null
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

async function ensureClientFromLead(lead) {
  if (!lead || !['converted', 'won'].includes(lead.status)) {
    return null
  }

  if (isMongoReady()) {
    const existing = await Client.findOne({
      $or: [
        ...(lead.email ? [{ email: lead.email.toLowerCase() }] : []),
        { company: lead.company },
      ],
    })

    if (existing) {
      return serializeClient(existing)
    }

    const client = await Client.create({
      ...createClientFromLead(lead),
      accountOwnerId: lead.assignedTo,
      accountOwnerName: lead.assignedUserName,
      healthScore: lead.score,
      renewalDate: lead.nextFollowUp,
      lastContactChannel: lead.lastContactChannel,
      callLogs: lead.callLogs || [],
      messages: lead.messages || [],
      timeline: lead.timeline || [],
    })
    return serializeClient(client)
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
  const existingLead = await findLeadByIdentity({ phone: payload.phone, email: payload.email })
  const assignee = await selectAssignee(payload)
  if (!assignee) {
    const error = new Error('No active CRM users are available for lead assignment. Configure ADMIN_EMAIL and ADMIN_PASSWORD, then restart the API.')
    error.statusCode = 503
    throw error
  }
  const now = new Date().toISOString()
  const parsedTags = parseTags(payload.tags)
  const score = computeLeadScore(payload)
  const segment = deriveSegment(score)
  const priority = derivePriority(payload, segment)
  const followUpSequence = buildFollowUpSequence(
    { name: payload.name, phone: payload.phone, email: payload.email },
    payload.preferredChannels
  )
  const tags = buildLeadTags(payload, segment, parsedTags)

  if (existingLead) {
    const mergedLead = {
      ...existingLead,
      name: payload.name || existingLead.name,
      phone: payload.phone || existingLead.phone,
      email: payload.email || existingLead.email,
      company: payload.company || existingLead.company,
      notes: [existingLead.notes, payload.notes].filter(Boolean).join('\n'),
      source: payload.source || existingLead.source,
      status: existingLead.status === 'converted' ? existingLead.status : payload.status || existingLead.status,
      department: payload.department || existingLead.department,
      requiredSkill: payload.requiredSkill || existingLead.requiredSkill,
      score: Math.max(existingLead.score || 0, score),
      segment,
      budget: payload.budget ?? existingLead.budget,
      interestLevel: payload.interestLevel || existingLead.interestLevel,
      engagementLevel: payload.engagementLevel || existingLead.engagementLevel,
      location: payload.location || existingLead.location,
      consent: payload.consent ? { ...(existingLead.consent || {}), ...payload.consent } : existingLead.consent,
      sourceMeta: payload.sourceMeta ? { ...(existingLead.sourceMeta || {}), ...payload.sourceMeta } : existingLead.sourceMeta,
      priority,
      tags: Array.from(new Set([...(existingLead.tags || []), ...tags])),
      lastActivity: now,
      nextFollowUp: payload.nextFollowUp || existingLead.nextFollowUp || followUpSequence[0]?.scheduledFor,
      automation: {
        ...(existingLead.automation || {}),
        autoAssigned: true,
        chatbotEnabled: true,
        lastWorkflow: 'lead-dedup-merge',
        followUpSequence: existingLead.automation?.followUpSequence || followUpSequence,
      },
    }

    appendTimeline(mergedLead, {
      type: 'system',
      title: 'Duplicate capture merged',
      description: `A new ${payload.source} capture matched this lead, so the record was merged instead of duplicated.`,
    })

    if (isMongoReady()) {
      const saved = await Lead.findByIdAndUpdate(existingLead.id, mergedLead, { new: true })
      const serialized = serializeLead(saved)
      await writeActivity('lead.merged', 'lead', serialized.id, { source: payload.source }, actor)
      return serialized
    }

    Object.assign(existingLead, mergedLead)
    await writeActivity('lead.merged', 'lead', existingLead.id, { source: payload.source }, actor)
    return existingLead
  }

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
    score,
    segment,
    value: payload.budget || (payload.source === 'meta_ads' ? 50000 : 25000),
    budget: payload.budget,
    interestLevel: payload.interestLevel || 'medium',
    engagementLevel: payload.engagementLevel || 'medium',
    notes: payload.notes || 'Lead captured via CRM API.',
    priority,
    tags,
    location: payload.location,
    consent: {
      termsAccepted: Boolean(payload.consent?.termsAccepted),
      marketingOptIn: Boolean(payload.consent?.marketingOptIn),
      privacyAcceptedAt: payload.consent?.privacyAcceptedAt || now,
      captureMethod: payload.consent?.captureMethod || payload.source || 'manual',
      ipAddress: actor?.ipAddress,
    },
    sourceMeta: payload.sourceMeta || {},
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
      abVariant: leadScoreVariant(score),
      followUpSequence,
      lastSyncedAt: now,
    },
  }

  appendTimeline(lead, {
    type: 'system',
    title: 'Lead created',
    description: `Lead was added from ${lead.source} and assigned to ${assignee.name}.`,
  })

  const outreachResults = await runInitialOutreach(lead)
  for (const result of outreachResults) {
    lead.messages.unshift({
      id: randomUUID(),
      channel: result.channel,
      direction: 'outbound',
      body: result.body,
      templateName: followUpSequence[0]?.templateName,
      status: result.sent ? 'delivered' : 'failed',
      timestamp: new Date().toISOString(),
    })
  }

  await maybeNotifyHotLead(lead)
  await syncLeadToAutomationPlatforms({
    event: 'lead.created',
    lead,
    team: { assignedTo: lead.assignedTo, assignedUserName: lead.assignedUserName },
  })

  let persistedLead = lead
  if (isMongoReady()) {
    const saved = await Lead.create({
      ...lead,
      automation: {
        ...lead.automation,
        followUpSequence: followUpSequence.map(({ id, ...step }) => step),
      },
      messages: lead.messages,
      timeline: lead.timeline,
    })
    persistedLead = serializeLead(saved)
  } else {
    store.leads.unshift(lead)
  }

  await writeActivity('lead.created', 'lead', persistedLead.id, { source: persistedLead.source, segment }, actor)
  await ensureClientFromLead(persistedLead)
  return persistedLead
}

// ---- Pagination / sorting / filtering helpers ------------------------------

function parsePagination(query = {}) {
  const limitRaw = Number(query.limit)
  const offsetRaw = Number(query.offset)
  const pageRaw = Number(query.page)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(500, Math.floor(limitRaw)) : null
  let offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? Math.floor(offsetRaw) : 0
  if (!offset && Number.isFinite(pageRaw) && pageRaw > 1 && limit) {
    offset = (Math.floor(pageRaw) - 1) * limit
  }
  return { limit, offset }
}

function parseSort(value, allowed, fallback) {
  if (!value) return fallback
  const direction = String(value).startsWith('-') ? -1 : 1
  const field = String(value).replace(/^[-+]/, '')
  if (!allowed.includes(field)) return fallback
  return { [field]: direction }
}

function buildDateRange(field, query = {}) {
  const from = query[`${field}From`] || query.dateFrom
  const to = query[`${field}To`] || query.dateTo
  const range = {}
  if (from && !Number.isNaN(Date.parse(from))) range.$gte = new Date(from)
  if (to && !Number.isNaN(Date.parse(to))) range.$lte = new Date(to)
  return Object.keys(range).length ? range : null
}

function applyInMemorySort(items, sort) {
  if (!sort) return items
  const [field, direction] = Object.entries(sort)[0]
  return [...items].sort((a, b) => {
    const av = a?.[field]
    const bv = b?.[field]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (av < bv) return -1 * direction
    if (av > bv) return 1 * direction
    return 0
  })
}

function applyInMemoryDateRange(items, field, range) {
  if (!range) return items
  return items.filter((item) => {
    const ts = item?.[field] ? new Date(item[field]).getTime() : NaN
    if (Number.isNaN(ts)) return false
    if (range.$gte && ts < range.$gte.getTime()) return false
    if (range.$lte && ts > range.$lte.getTime()) return false
    return true
  })
}

function paginate(items, { limit, offset }) {
  if (!limit) return items
  return items.slice(offset, offset + limit)
}

const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'score', 'lastActivity', 'nextFollowUp', 'name']
const CLIENT_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'healthScore', 'lifetimeValue', 'lastContact', 'renewalDate']
const DEAL_SORT_FIELDS = ['createdAt', 'updatedAt', 'value', 'expectedCloseDate', 'stage', 'probability', 'name']
const TASK_SORT_FIELDS = ['createdAt', 'updatedAt', 'dueDate', 'priority', 'status', 'title']

async function listLeads(filters = {}) {
  const sort = parseSort(filters.sort, LEAD_SORT_FIELDS, { createdAt: -1 })
  const dateRange = buildDateRange('createdAt', filters)
  const pagination = parsePagination(filters)
  const search = String(filters.q || '').toLowerCase()

  if (isMongoReady()) {
    const query = {}
    if (filters.status) query.status = filters.status
    if (filters.source) query.source = filters.source
    if (filters.assignedTo) query.assignedTo = filters.assignedTo
    if (filters.segment) query.segment = filters.segment
    if (filters.priority) query.priority = filters.priority
    if (dateRange) query.createdAt = dateRange
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const rx = new RegExp(safe, 'i')
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { company: rx }]
    }

    const total = await Lead.countDocuments(query)
    let cursor = Lead.find(query).sort(sort)
    if (pagination.limit) cursor = cursor.skip(pagination.offset).limit(pagination.limit)
    const records = (await cursor).map(serializeLead)
    return { data: records, total, limit: pagination.limit, offset: pagination.offset }
  }

  let items = store.leads.filter((lead) => {
    if (filters.status && lead.status !== filters.status) return false
    if (filters.source && lead.source !== filters.source) return false
    if (filters.assignedTo && lead.assignedTo !== filters.assignedTo) return false
    if (filters.segment && lead.segment !== filters.segment) return false
    if (filters.priority && lead.priority !== filters.priority) return false
    if (search) {
      const haystack = [lead.name, lead.email, lead.phone, lead.company].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })

  items = applyInMemoryDateRange(items, 'createdAt', dateRange)
  items = applyInMemorySort(items, sort)
  const total = items.length
  return { data: paginate(items, pagination), total, limit: pagination.limit, offset: pagination.offset }
}

async function listClients(filters = {}) {
  const sort = parseSort(filters.sort, CLIENT_SORT_FIELDS, { createdAt: -1 })
  const dateRange = buildDateRange('createdAt', filters)
  const pagination = parsePagination(filters)
  const search = String(filters.q || '').toLowerCase()

  if (isMongoReady()) {
    const query = {}
    if (filters.status) query.status = filters.status
    if (filters.segment) query.segment = filters.segment
    if (filters.accountOwnerId) query.accountOwnerId = filters.accountOwnerId
    if (dateRange) query.createdAt = dateRange
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const rx = new RegExp(safe, 'i')
      query.$or = [{ name: rx }, { email: rx }, { phone: rx }, { company: rx }]
    }
    const total = await Client.countDocuments(query)
    let cursor = Client.find(query).sort(sort)
    if (pagination.limit) cursor = cursor.skip(pagination.offset).limit(pagination.limit)
    const records = (await cursor).map(serializeClient)
    return { data: records, total, limit: pagination.limit, offset: pagination.offset }
  }

  let items = store.clients.filter((client) => {
    if (filters.status && client.status !== filters.status) return false
    if (filters.segment && client.segment !== filters.segment) return false
    if (filters.accountOwnerId && client.accountOwnerId !== filters.accountOwnerId) return false
    if (search) {
      const haystack = [client.name, client.email, client.phone, client.company].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
  items = applyInMemoryDateRange(items, 'createdAt', dateRange)
  items = applyInMemorySort(items, sort)
  const total = items.length
  return { data: paginate(items, pagination), total, limit: pagination.limit, offset: pagination.offset }
}

async function listDeals(filters = {}) {
  const sort = parseSort(filters.sort, DEAL_SORT_FIELDS, { updatedAt: -1, createdAt: -1 })
  const dateRange = buildDateRange('createdAt', filters)
  const pagination = parsePagination(filters)
  const search = String(filters.q || '').toLowerCase()

  if (isMongoReady()) {
    const query = {}
    if (filters.stage) query.stage = filters.stage
    if (filters.assignedTo) query.assignedTo = filters.assignedTo
    if (filters.priority) query.priority = filters.priority
    if (filters.clientId) query.clientId = filters.clientId
    if (dateRange) query.createdAt = dateRange
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const rx = new RegExp(safe, 'i')
      query.$or = [{ name: rx }, { clientName: rx }, { description: rx }]
    }
    const total = await Deal.countDocuments(query)
    let cursor = Deal.find(query).sort(sort)
    if (pagination.limit) cursor = cursor.skip(pagination.offset).limit(pagination.limit)
    const records = (await cursor).map(serializeRecord)
    return { data: records, total, limit: pagination.limit, offset: pagination.offset }
  }

  let items = store.deals.filter((deal) => {
    if (filters.stage && deal.stage !== filters.stage) return false
    if (filters.assignedTo && deal.assignedTo !== filters.assignedTo) return false
    if (filters.priority && deal.priority !== filters.priority) return false
    if (filters.clientId && deal.clientId !== filters.clientId) return false
    if (search) {
      const haystack = [deal.name, deal.clientName, deal.description].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
  items = applyInMemoryDateRange(items, 'createdAt', dateRange)
  items = applyInMemorySort(items, sort)
  const total = items.length
  return { data: paginate(items, pagination), total, limit: pagination.limit, offset: pagination.offset }
}

async function listTasks(filters = {}) {
  const sort = parseSort(filters.sort, TASK_SORT_FIELDS, { dueDate: 1, createdAt: -1 })
  const dateRange = buildDateRange('dueDate', filters)
  const pagination = parsePagination(filters)
  const search = String(filters.q || '').toLowerCase()

  if (isMongoReady()) {
    const query = {}
    if (filters.status) query.status = filters.status
    if (filters.assignedTo) query.assignedTo = filters.assignedTo
    if (filters.priority) query.priority = filters.priority
    if (filters.relatedType) query['relatedTo.type'] = filters.relatedType
    if (filters.relatedId) query['relatedTo.id'] = filters.relatedId
    if (dateRange) query.dueDate = dateRange
    if (search) {
      const safe = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const rx = new RegExp(safe, 'i')
      query.$or = [{ title: rx }, { description: rx }]
    }
    const total = await Task.countDocuments(query)
    let cursor = Task.find(query).sort(sort)
    if (pagination.limit) cursor = cursor.skip(pagination.offset).limit(pagination.limit)
    const records = (await cursor).map(serializeRecord)
    return { data: records, total, limit: pagination.limit, offset: pagination.offset }
  }

  let items = store.tasks.filter((task) => {
    if (filters.status && task.status !== filters.status) return false
    if (filters.assignedTo && task.assignedTo !== filters.assignedTo) return false
    if (filters.priority && task.priority !== filters.priority) return false
    if (filters.relatedType && task.relatedTo?.type !== filters.relatedType) return false
    if (filters.relatedId && task.relatedTo?.id !== filters.relatedId) return false
    if (search) {
      const haystack = [task.title, task.description].filter(Boolean).join(' ').toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
  items = applyInMemoryDateRange(items, 'dueDate', dateRange)
  items = applyInMemorySort(items, sort)
  const total = items.length
  return { data: paginate(items, pagination), total, limit: pagination.limit, offset: pagination.offset }
}

function buildAnalyticsFromLeads(leads) {
  const totalLeads = leads.length
  const converted = leads.filter((lead) => ['converted', 'won'].includes(lead.status)).length
  const hotLeads = leads.filter((lead) => lead.segment === 'hot').length
  const warmLeads = leads.filter((lead) => lead.segment === 'warm').length
  const coldLeads = leads.filter((lead) => lead.segment === 'cold').length
  const totalValue = leads.reduce((sum, lead) => sum + (lead.value || 0), 0)
  const avgScore = totalLeads ? Math.round(leads.reduce((sum, lead) => sum + (lead.score || 0), 0) / totalLeads) : 0
  const conversionRate = totalLeads ? Number(((converted / totalLeads) * 100).toFixed(1)) : 0

  const sourcePerformance = Object.entries(
    leads.reduce((acc, lead) => {
      acc[lead.source] = acc[lead.source] || { leads: 0, conversions: 0, value: 0 }
      acc[lead.source].leads += 1
      acc[lead.source].value += lead.value || 0
      if (['converted', 'won'].includes(lead.status)) {
        acc[lead.source].conversions += 1
      }
      return acc
    }, {})
  ).map(([source, stats]) => ({
    source,
    leads: stats.leads,
    conversions: stats.conversions,
    conversionRate: stats.leads ? Number(((stats.conversions / stats.leads) * 100).toFixed(1)) : 0,
    pipelineValue: stats.value,
  }))

  return {
    summary: { totalLeads, converted, conversionRate, hotLeads, warmLeads, coldLeads, totalValue, avgScore },
    sourcePerformance,
    funnel: [
      { stage: 'Captured', count: totalLeads },
      { stage: 'Qualified', count: leads.filter((lead) => ['interested', 'converted', 'won'].includes(lead.status) || lead.segment === 'hot').length },
      { stage: 'Converted', count: converted },
    ],
  }
}

function getAutomationBlueprint() {
  return {
    workflowDiagram: [
      '1. Lead Source -> Landing Page / Form / Ad / LinkedIn / WhatsApp / IVR',
      '2. Capture API -> Validate consent, normalize fields, deduplicate by phone/email',
      '3. Qualification Engine -> Score by source, budget, intent, engagement, and enrichment',
      '4. Routing Engine -> Tag, segment hot/warm/cold, assign owner by skill + load',
      '5. Response Engine -> Instant WhatsApp / Email / SMS reply + Day 1 / Day 3 / Day 7 sequence',
      '6. Notifications -> Slack / Email alert for hot leads + task creation for sales',
      '7. CRM Sync -> Mongo-backed CRM record + outbound Zapier/Make sync',
      '8. Analytics -> Source conversion, ROI, response performance, and funnel dashboard',
    ],
    toolStack: {
      free: [
        { category: 'Forms', tools: ['Google Forms', 'Typeform Free', 'Custom Vite landing page'] },
        { category: 'CRM/Data', tools: ['MongoDB Atlas Free', 'Airtable Free'] },
        { category: 'Automation', tools: ['Make free tier', 'Zapier starter trial'] },
        { category: 'Reporting', tools: ['Google Sheets', 'Looker Studio'] },
      ],
      paid: [
        { category: 'CRM', tools: ['HubSpot Starter', 'Zoho CRM Professional'] },
        { category: 'Messaging', tools: ['Twilio SMS/WhatsApp', 'Meta WhatsApp Cloud API'] },
        { category: 'Sales Alerts', tools: ['Slack', 'Google Workspace email'] },
        { category: 'Optimization', tools: ['Vercel Pro', 'MongoDB Atlas dedicated tier'] },
      ],
    },
    sampleWorkflows: [
      'Meta/Instagram lead -> score > 85 -> assign inbound rep -> send WhatsApp welcome -> Slack hot-lead alert -> schedule Day 3 and Day 7 follow-up.',
      'Website pricing form -> budget > 25000 -> tag enterprise -> send email case study -> create sales task -> sync to HubSpot/Zoho via webhook.',
      'WhatsApp inbound -> unknown number -> auto-create lead -> reply instantly -> mark warm -> notify shared team inbox.',
    ],
    messageExamples: {
      email: 'Subject: Thanks for reaching out\nHi {{name}}, thanks for your interest in {{company}}. We can help you streamline lead management and follow-ups. Would you like a 15-minute walkthrough this week?',
      sms: 'Hi {{name}}, thanks for contacting us. Reply with the best time for a quick call and we will coordinate right away.',
      whatsapp: 'Hi {{name}}, thanks for your inquiry. We received your request and one of our specialists will contact you shortly. If you want pricing or a demo, just reply here.',
    },
    bestPractices: [
      'Keep every form under 5 required fields unless the campaign is high-intent.',
      'Route hot leads in under 5 minutes and include a human follow-up task even when automation fires.',
      'Use consent checkboxes and store the timestamp, source, and policy acceptance method.',
      'Run A/B tests on form length, CTA text, and first-touch message copy.',
      'Track source-level CPL, conversion rate, and speed-to-lead weekly.',
    ],
  }
}

// Lightweight liveness probe — no DB/integration calls, safe for uptime checks.
const livenessHandler = (_req, res) => {
  res.json({
    status: 'ok',
    service: 'nexus-crm-backend',
    time: new Date().toISOString(),
    uptime: process.uptime(),
  })
}
app.get('/health', livenessHandler)
app.get('/api/ping', livenessHandler)

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    uptime: process.uptime(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'not-configured',
    integrations: getIntegrationStatus(),
    realtime: realtimeStatus(),
    ai: aiStatus(),
    push: pushStatus(),
  })
})

const aiChatSchema = z.object({
  message: z.string().min(1).max(4000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string().max(8000),
      })
    )
    .max(20)
    .optional(),
  context: z.record(z.any()).optional(),
})

app.post('/api/ai/chat', authenticate, async (req, res) => {
  const parsed = aiChatSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() })
  }
  try {
    const result = await generateAiReply({
      message: parsed.data.message,
      history: parsed.data.history || [],
      context: parsed.data.context || {},
      user: req.user,
    })
    res.json(result)
  } catch (error) {
    const status = error?.statusCode || 500
    res.status(status).json({ error: error?.message || 'AI request failed' })
  }
})

const pushSubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
  userAgent: z.string().optional(),
})

app.get('/api/push/public-key', (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null })
})

app.post('/api/push/subscribe', authenticate, async (req, res) => {
  const parsed = pushSubscribeSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'Invalid subscription' })
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database not connected' })
  }
  const { subscription, userAgent } = parsed.data
  await PushSubscription.findOneAndUpdate(
    { endpoint: subscription.endpoint },
    {
      userId: req.user.id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: userAgent || req.headers['user-agent'] || null,
    },
    { upsert: true, new: true }
  )
  res.json({ ok: true })
})

app.post('/api/push/unsubscribe', authenticate, async (req, res) => {
  const endpoint = req.body?.endpoint
  if (!endpoint) return res.status(400).json({ error: 'Missing endpoint' })
  if (mongoose.connection.readyState !== 1) return res.json({ ok: true })
  await PushSubscription.deleteOne({ endpoint, userId: req.user.id })
  res.json({ ok: true })
})

app.post('/api/push/test', authenticate, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database not connected' })
  }
  if (!initWebPush()) {
    return res.status(503).json({ error: 'VAPID keys not configured' })
  }
  const subs = await PushSubscription.find({ userId: req.user.id }).lean()
  const payload = {
    title: req.body?.title || 'Nexus CRM',
    body: req.body?.body || 'This is a test notification.',
    url: req.body?.url || '/',
  }
  const results = await Promise.all(
    subs.map(async (sub) => {
      const result = await sendPush(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload
      )
      if (result.gone) {
        await PushSubscription.deleteOne({ endpoint: sub.endpoint })
      }
      return { endpoint: sub.endpoint, ...result }
    })
  )
  res.json({ sent: results.length, results })
})

async function notifyUserPush(userId, payload) {
  if (!userId) return
  if (mongoose.connection.readyState !== 1) return
  if (!initWebPush()) return
  try {
    const subs = await PushSubscription.find({ userId }).lean()
    await Promise.all(
      subs.map(async (sub) => {
        const result = await sendPush({ endpoint: sub.endpoint, keys: sub.keys }, payload)
        if (result.gone) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint })
        }
      })
    )
  } catch (error) {
    console.warn('[push] notifyUserPush failed', error?.message)
  }
}

const workflowConditionSchema = z.object({
  id: z.string().optional(),
  trigger: z.string(),
  operator: z.string(),
  value: z.string(),
})
const workflowActionSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  config: z.record(z.any()).optional(),
})
const workflowPayloadSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  triggerLogic: z.enum(['AND', 'OR']).optional(),
  conditions: z.array(workflowConditionSchema).default([]),
  actions: z.array(workflowActionSchema).default([]),
})

function serializeWorkflow(doc) {
  if (!doc) return null
  const obj = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : doc
  return {
    ...obj,
    id: String(obj._id || obj.id),
    _id: undefined,
  }
}

app.get('/api/workflows', authenticate, async (_req, res, next) => {
  try {
    if (!isMongoReady()) return res.json({ data: [] })
    const workflows = await Workflow.find().sort({ createdAt: -1 }).lean()
    res.json({ data: workflows.map(serializeWorkflow) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/workflows', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const payload = workflowPayloadSchema.parse(req.body)
    if (!isMongoReady()) return res.status(503).json({ error: 'Database not connected' })
    const created = await Workflow.create({ ...payload, createdBy: req.user.id })
    await writeActivity('workflow.created', 'workflow', String(created._id), { name: payload.name }, req.user)
    res.status(201).json({ data: serializeWorkflow(created) })
  } catch (error) {
    next(error)
  }
})

app.patch('/api/workflows/:id', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const updates = workflowPayloadSchema.partial().parse(req.body)
    if (!isMongoReady()) return res.status(503).json({ error: 'Database not connected' })
    const saved = await Workflow.findByIdAndUpdate(req.params.id, updates, { new: true })
    if (!saved) return res.status(404).json({ error: 'Workflow not found' })
    await writeActivity('workflow.updated', 'workflow', req.params.id, updates, req.user)
    res.json({ data: serializeWorkflow(saved) })
  } catch (error) {
    next(error)
  }
})

app.delete('/api/workflows/:id', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    if (!isMongoReady()) return res.status(503).json({ error: 'Database not connected' })
    const removed = await Workflow.findByIdAndDelete(req.params.id)
    if (!removed) return res.status(404).json({ error: 'Workflow not found' })
    await writeActivity('workflow.deleted', 'workflow', req.params.id, {}, req.user)
    res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

app.get('/api/workflows/:id/executions', authenticate, async (req, res, next) => {
  try {
    if (!isMongoReady()) return res.json({ data: [] })
    const items = await WorkflowExecution.find({ workflowId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean()
    res.json({ data: items })
  } catch (error) {
    next(error)
  }
})

app.get('/api/automation/blueprint', authenticate, (_req, res) => {
  res.json({ data: getAutomationBlueprint() })
})

app.get('/api/analytics/overview', authenticate, async (_req, res, next) => {
  try {
    const result = await listLeads()
    res.json({ data: buildAnalyticsFromLeads(result.data) })
  } catch (error) {
    next(error)
  }
})

app.post('/api/auth/login', authRateLimiter, async (req, res, next) => {
  try {
    const { email, password } = authSchema.parse(req.body)
    let user = null
    await connectMongo()

    if (isMongoReady()) {
      await ensureBootstrapAdmin()
      user = await User.findOne({ email: email.toLowerCase(), status: 'active' }).lean()
    } else {
      user = store.users.find((item) => item.email.toLowerCase() === email.toLowerCase())
    }

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ message: 'Invalid credentials' })
    }

    const safeUser = serializeUser(user)
    const tokens = issueTokens(safeUser)
    await writeActivity('auth.login', 'auth', safeUser.id, {}, safeUser)

    return res.json({
      user: safeUser,
      ...tokens,
    })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/auth/refresh', authRateLimiter, (req, res) => {
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

app.get('/api/users', authenticate, async (_req, res, next) => {
  try {
    const users = await listUsers()
    res.json({ data: users, total: users.length })
  } catch (error) {
    next(error)
  }
})

const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(['admin', 'manager', 'sales', 'viewer']).default('sales'),
  status: z.enum(['active', 'inactive']).default('active'),
  department: z.enum(['inbound', 'outbound', 'enterprise', 'support']).optional(),
  skills: z.array(z.string()).optional(),
  maxActiveLeads: z.number().int().nonnegative().optional(),
  isAvailable: z.boolean().optional(),
  avatar: z.string().url().optional(),
})

const userUpdateSchema = userCreateSchema.partial().extend({
  password: z.string().min(8).optional(),
})

app.post('/api/users', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    const payload = userCreateSchema.parse(req.body)
    const email = payload.email.toLowerCase()

    if (isMongoReady()) {
      const existing = await User.findOne({ email })
      if (existing) return res.status(409).json({ message: 'A user with this email already exists' })
      const user = await User.create({
        ...payload,
        email,
        passwordHash: bcrypt.hashSync(payload.password, 12),
        lastActive: new Date(),
      })
      const serialized = serializeUser(user)
      await writeActivity('user.created', 'auth', serialized.id, { role: serialized.role }, req.user)
      return res.status(201).json({ data: serialized })
    }

    if (store.users.find((u) => u.email.toLowerCase() === email)) {
      return res.status(409).json({ message: 'A user with this email already exists' })
    }
    const user = {
      id: randomUUID(),
      ...payload,
      email,
      passwordHash: bcrypt.hashSync(payload.password, 12),
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    }
    store.users.push(user)
    await writeActivity('user.created', 'auth', user.id, { role: user.role }, req.user)
    return res.status(201).json({ data: sanitizeUser(user) })
  } catch (error) {
    return next(error)
  }
})

app.patch('/api/users/:id', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    const updates = userUpdateSchema.parse(req.body)
    const patch = { ...updates }
    if (updates.password) {
      patch.passwordHash = bcrypt.hashSync(updates.password, 12)
      delete patch.password
    }
    if (updates.email) patch.email = updates.email.toLowerCase()

    if (isMongoReady()) {
      const saved = await User.findByIdAndUpdate(req.params.id, patch, { new: true })
      if (!saved) return res.status(404).json({ message: 'User not found' })
      await writeActivity('user.updated', 'auth', req.params.id, Object.keys(updates), req.user)
      return res.json({ data: serializeUser(saved) })
    }

    const user = store.users.find((u) => u.id === req.params.id)
    if (!user) return res.status(404).json({ message: 'User not found' })
    Object.assign(user, patch)
    await writeActivity('user.updated', 'auth', user.id, Object.keys(updates), req.user)
    return res.json({ data: sanitizeUser(user) })
  } catch (error) {
    return next(error)
  }
})

app.delete('/api/users/:id', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    if (req.user.sub === req.params.id) {
      return res.status(400).json({ message: 'You cannot delete your own account while signed in.' })
    }
    if (isMongoReady()) {
      const deleted = await User.findByIdAndUpdate(req.params.id, { status: 'inactive' }, { new: true })
      if (!deleted) return res.status(404).json({ message: 'User not found' })
    } else {
      const user = store.users.find((u) => u.id === req.params.id)
      if (!user) return res.status(404).json({ message: 'User not found' })
      user.status = 'inactive'
    }

    await writeActivity('user.deactivated', 'auth', req.params.id, {}, req.user)
    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/clients', authenticate, async (req, res, next) => {
  try {
    const result = await listClients(req.query)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/clients', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const payload = clientPayloadSchema.parse(req.body)
    const clientPayload = {
      ...payload,
      lastContact: payload.lastContact || new Date().toISOString(),
      createdAt: new Date().toISOString(),
    }

    if (isMongoReady()) {
      const client = await Client.create(clientPayload)
      const serialized = serializeClient(client)
      await writeActivity('client.created', 'client', serialized.id, {}, req.user)
      return res.status(201).json({ data: serialized })
    }

    const client = { id: req.body.id || randomUUID(), ...clientPayload }
    store.clients.unshift(client)
    await writeActivity('client.created', 'client', client.id, {}, req.user)
    return res.status(201).json({ data: client })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/clients/:id', authenticate, async (req, res) => {
  const client = await findClient(req.params.id)

  if (!client) {
    return res.status(404).json({ message: 'Client not found' })
  }

  return res.json({ data: client })
})

app.patch('/api/clients/:id', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const client = await findClient(req.params.id)
    if (!client) {
      return res.status(404).json({ message: 'Client not found' })
    }

    const updates = clientPayloadSchema.partial().parse(req.body)
    const nextClient = {
      ...client,
      ...updates,
      lastContact: updates.lastContact || new Date().toISOString(),
    }

    nextClient.timeline = nextClient.timeline || []
    nextClient.timeline.unshift({
      id: randomUUID(),
      type: 'status',
      title: 'Client updated',
      description: 'Client profile was updated from the CRM.',
      timestamp: new Date().toISOString(),
    })

    if (isMongoReady()) {
      const saved = await Client.findByIdAndUpdate(req.params.id, nextClient, { new: true })
      await writeActivity('client.updated', 'client', req.params.id, updates, req.user)
      return res.json({ data: serializeClient(saved) })
    }

    Object.assign(client, nextClient)

    await writeActivity('client.updated', 'client', client.id, updates, req.user)
    return res.json({ data: client })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/clients/:id/calls', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const client = await findClient(req.params.id)
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

    if (isMongoReady()) {
      await Client.findByIdAndUpdate(req.params.id, client, { new: true })
    }

    await writeActivity('client.call.logged', 'client', client.id, payload, req.user)
    return res.status(201).json({ data: call })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/clients/:id/messages', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const client = await findClient(req.params.id)
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

    if (isMongoReady()) {
      await Client.findByIdAndUpdate(req.params.id, client, { new: true })
    }

    await writeActivity('client.message.logged', 'client', client.id, payload, req.user)
    return res.status(201).json({ data: message })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/deals', authenticate, async (req, res, next) => {
  try {
    const result = await listDeals(req.query)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/deals', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const payload = dealPayloadSchema.parse(req.body)
    if (isMongoReady()) {
      const deal = await Deal.create(payload)
      const serialized = serializeRecord(deal)
      await writeActivity('deal.created', 'deal', serialized.id, {}, req.user)
      return res.status(201).json({ data: serialized })
    }

    const deal = { id: req.body.id || randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...payload }
    store.deals.unshift(deal)
    await writeActivity('deal.created', 'deal', deal.id, {}, req.user)
    return res.status(201).json({ data: deal })
  } catch (error) {
    return next(error)
  }
})

app.patch('/api/deals/:id', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const updates = dealPayloadSchema.partial().parse(req.body)
    if (isMongoReady()) {
      const saved = await Deal.findByIdAndUpdate(req.params.id, { ...updates, updatedAt: new Date() }, { new: true })
      if (!saved) return res.status(404).json({ message: 'Deal not found' })
      const serialized = serializeRecord(saved)
      await writeActivity('deal.updated', 'deal', serialized.id, updates, req.user)
      return res.json({ data: serialized })
    }

    const deal = store.deals.find((item) => item.id === req.params.id)
    if (!deal) return res.status(404).json({ message: 'Deal not found' })
    Object.assign(deal, updates, { updatedAt: new Date().toISOString() })
    await writeActivity('deal.updated', 'deal', deal.id, updates, req.user)
    return res.json({ data: deal })
  } catch (error) {
    return next(error)
  }
})

app.delete('/api/deals/:id', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    if (isMongoReady()) {
      const deleted = await Deal.findByIdAndDelete(req.params.id)
      if (!deleted) return res.status(404).json({ message: 'Deal not found' })
    } else {
      const index = store.deals.findIndex((deal) => deal.id === req.params.id)
      if (index === -1) return res.status(404).json({ message: 'Deal not found' })
      store.deals.splice(index, 1)
    }

    await writeActivity('deal.deleted', 'deal', req.params.id, {}, req.user)
    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/tasks', authenticate, async (req, res, next) => {
  try {
    const result = await listTasks(req.query)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

app.post('/api/tasks', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const payload = taskPayloadSchema.parse(req.body)
    if (isMongoReady()) {
      const task = await Task.create(payload)
      const serialized = serializeRecord(task)
      await writeActivity('task.created', 'task', serialized.id, {}, req.user)
      if (serialized.assignedTo && serialized.assignedTo !== req.user.id) {
        notifyUserPush(serialized.assignedTo, {
          title: 'New task assigned',
          body: serialized.title || 'You have a new task',
          url: '/tasks',
        })
      }
      return res.status(201).json({ data: serialized })
    }

    const task = { id: req.body.id || randomUUID(), createdAt: new Date().toISOString(), ...payload }
    store.tasks.unshift(task)
    await writeActivity('task.created', 'task', task.id, {}, req.user)
    if (task.assignedTo && task.assignedTo !== req.user.id) {
      notifyUserPush(task.assignedTo, {
        title: 'New task assigned',
        body: task.title || 'You have a new task',
        url: '/tasks',
      })
    }
    return res.status(201).json({ data: task })
  } catch (error) {
    return next(error)
  }
})

app.patch('/api/tasks/:id', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const updates = taskPayloadSchema.partial().parse(req.body)
    if (isMongoReady()) {
      const saved = await Task.findByIdAndUpdate(req.params.id, updates, { new: true })
      if (!saved) return res.status(404).json({ message: 'Task not found' })
      const serialized = serializeRecord(saved)
      await writeActivity('task.updated', 'task', serialized.id, updates, req.user)
      return res.json({ data: serialized })
    }

    const task = store.tasks.find((item) => item.id === req.params.id)
    if (!task) return res.status(404).json({ message: 'Task not found' })
    Object.assign(task, updates)
    await writeActivity('task.updated', 'task', task.id, updates, req.user)
    return res.json({ data: task })
  } catch (error) {
    return next(error)
  }
})

app.delete('/api/tasks/:id', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    if (isMongoReady()) {
      const deleted = await Task.findByIdAndDelete(req.params.id)
      if (!deleted) return res.status(404).json({ message: 'Task not found' })
    } else {
      const index = store.tasks.findIndex((task) => task.id === req.params.id)
      if (index === -1) return res.status(404).json({ message: 'Task not found' })
      store.tasks.splice(index, 1)
    }

    await writeActivity('task.deleted', 'task', req.params.id, {}, req.user)
    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/leads', authenticate, async (req, res, next) => {
  try {
    const result = await listLeads(req.query)
    res.json(result)
  } catch (error) {
    next(error)
  }
})

const LEAD_CSV_COLUMNS = [
  { key: 'id', label: 'id' },
  { key: 'name', label: 'name' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'company', label: 'company' },
  { key: 'source', label: 'source' },
  { key: 'status', label: 'status' },
  { key: 'segment', label: 'segment' },
  { key: 'priority', label: 'priority' },
  { key: 'score', label: 'score' },
  { key: 'value', label: 'value' },
  { key: 'budget', label: 'budget' },
  { key: 'interestLevel', label: 'interestLevel' },
  { key: 'engagementLevel', label: 'engagementLevel' },
  { key: 'assignedUserName', label: 'assignedUserName' },
  { key: 'department', label: 'department' },
  { key: 'tags', label: 'tags', get: (r) => (Array.isArray(r.tags) ? r.tags.join('|') : r.tags || '') },
  { key: 'city', label: 'city', get: (r) => r.location?.city || '' },
  { key: 'country', label: 'country', get: (r) => r.location?.country || '' },
  { key: 'notes', label: 'notes' },
  { key: 'lastActivity', label: 'lastActivity' },
  { key: 'nextFollowUp', label: 'nextFollowUp' },
  { key: 'createdAt', label: 'createdAt' },
]

app.get('/api/leads/export.csv', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    // Use same filters as list endpoint, but ignore pagination so the export
    // returns the full filtered set.
    const { limit, offset, page, ...filters } = req.query
    const result = await listLeads(filters)
    const csv = rowsToCsv(result.data, LEAD_CSV_COLUMNS)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send(csv)
  } catch (error) {
    next(error)
  }
})

const bulkImportSchema = z.object({
  csv: z.string().min(1).optional(),
  rows: z.array(z.record(z.any())).optional(),
}).refine((value) => Boolean(value.csv || value.rows), {
  message: 'Provide either "csv" text or a "rows" array',
})

app.post('/api/leads/import', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    const payload = bulkImportSchema.parse(req.body)
    const rows = payload.rows || parseCsv(payload.csv).rows
    const created = []
    const merged = []
    const failed = []

    for (const [index, raw] of rows.entries()) {
      try {
        const tags = raw.tags
          ? Array.isArray(raw.tags)
            ? raw.tags
            : String(raw.tags).split(/[|,]/).map((t) => t.trim()).filter(Boolean)
          : undefined

        const candidate = {
          name: raw.name || raw.fullName || raw['Full Name'] || '',
          email: raw.email || undefined,
          phone: raw.phone || raw.mobile || undefined,
          company: raw.company || raw.organization || undefined,
          source: raw.source || 'manual',
          status: raw.status || undefined,
          notes: raw.notes || undefined,
          assignedTo: raw.assignedTo || undefined,
          priority: raw.priority || undefined,
          department: raw.department || undefined,
          requiredSkill: raw.requiredSkill || undefined,
          tags,
          budget: raw.budget ? Number(raw.budget) : undefined,
          interestLevel: raw.interestLevel || undefined,
          engagementLevel: raw.engagementLevel || undefined,
          location: (raw.city || raw.country || raw.state)
            ? { city: raw.city, country: raw.country, state: raw.state }
            : undefined,
        }

        const parsed = leadSchema.parse(candidate)
        const before = await findLeadByIdentity({ phone: parsed.phone, email: parsed.email })
        const lead = await createLead(parsed, req.user)
        if (before && before.id === lead.id) {
          merged.push({ row: index + 2, id: lead.id })
        } else {
          created.push({ row: index + 2, id: lead.id })
        }
      } catch (error) {
        failed.push({
          row: index + 2,
          error: error instanceof z.ZodError ? error.issues : (error.message || 'Unknown error'),
        })
      }
    }

    await writeActivity('lead.bulk_import', 'lead', 'bulk', {
      created: created.length,
      merged: merged.length,
      failed: failed.length,
    }, req.user)

    return res.json({
      summary: { total: rows.length, created: created.length, merged: merged.length, failed: failed.length },
      created,
      merged,
      failed,
    })
  } catch (error) {
    return next(error)
  }
})

const CLIENT_CSV_COLUMNS = [
  { key: 'id', label: 'id' },
  { key: 'name', label: 'name' },
  { key: 'company', label: 'company' },
  { key: 'email', label: 'email' },
  { key: 'phone', label: 'phone' },
  { key: 'industry', label: 'industry' },
  { key: 'status', label: 'status' },
  { key: 'segment', label: 'segment' },
  { key: 'healthScore', label: 'healthScore' },
  { key: 'lifetimeValue', label: 'lifetimeValue' },
  { key: 'totalDeals', label: 'totalDeals' },
  { key: 'accountOwnerName', label: 'accountOwnerName' },
  { key: 'lastContact', label: 'lastContact' },
  { key: 'renewalDate', label: 'renewalDate' },
  { key: 'createdAt', label: 'createdAt' },
]

app.get('/api/clients/export.csv', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const { limit, offset, page, ...filters } = req.query
    const result = await listClients(filters)
    const csv = rowsToCsv(result.data, CLIENT_CSV_COLUMNS)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="clients-${new Date().toISOString().slice(0, 10)}.csv"`)
    res.send(csv)
  } catch (error) {
    next(error)
  }
})

app.delete('/api/clients/:id', authenticate, requireRoles('admin', 'manager'), async (req, res, next) => {
  try {
    if (isMongoReady()) {
      const deleted = await Client.findByIdAndDelete(req.params.id)
      if (!deleted) return res.status(404).json({ message: 'Client not found' })
    } else {
      const index = store.clients.findIndex((client) => client.id === req.params.id)
      if (index === -1) return res.status(404).json({ message: 'Client not found' })
      store.clients.splice(index, 1)
    }

    await writeActivity('client.deleted', 'client', req.params.id, {}, req.user)
    return res.json({ success: true })
  } catch (error) {
    return next(error)
  }
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

app.get('/api/leads/:id', authenticate, async (req, res) => {
  const lead = await findLead(req.params.id)

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' })
  }

  return res.json({ data: lead })
})

app.patch('/api/leads/:id', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const lead = await findLead(req.params.id)
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

    if (updates.score || updates.priority) {
      lead.segment = deriveSegment(Number(updates.score || lead.score || 0))
      lead.priority = derivePriority(lead, lead.segment)
    }

    if (isMongoReady()) {
      const saved = await Lead.findByIdAndUpdate(req.params.id, lead, { new: true })
      const serialized = serializeLead(saved)
      const client = await ensureClientFromLead(serialized)
      await writeActivity('lead.updated', 'lead', serialized.id, updates, req.user)
      return res.json({ data: serialized, client })
    }

    const client = await ensureClientFromLead(lead)

    await writeActivity('lead.updated', 'lead', lead.id, updates, req.user)
    return res.json({ data: lead, client })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/leads/:id/timeline', authenticate, async (req, res) => {
  const lead = await findLead(req.params.id)

  if (!lead) {
    return res.status(404).json({ message: 'Lead not found' })
  }

  return res.json({ data: lead.timeline || [] })
})

app.post('/api/leads/:id/calls', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const lead = await findLead(req.params.id)
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

    if (isMongoReady()) {
      await Lead.findByIdAndUpdate(req.params.id, lead, { new: true })
    }

    await writeActivity('call.logged', 'call', call.id, { leadId: lead.id, provider: payload.provider }, req.user)

    return res.status(201).json({ data: call, integration: callProviderResult })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/leads/:id/messages', authenticate, requireRoles('admin', 'manager', 'sales'), async (req, res, next) => {
  try {
    const lead = await findLead(req.params.id)
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

    if (isMongoReady()) {
      await Lead.findByIdAndUpdate(req.params.id, lead, { new: true })
    }

    await writeActivity('message.logged', 'message', message.id, { leadId: lead.id, channel: payload.channel }, req.user)

    return res.status(201).json({ data: message })
  } catch (error) {
    return next(error)
  }
})

app.get('/api/calls', authenticate, async (_req, res, next) => {
  try {
    if (isMongoReady()) {
      const { data: leads } = await listLeads()
      const calls = leads.flatMap((lead) => (lead.callLogs || []).map((call) => ({ leadId: lead.id, leadName: lead.name, ...call })))
      return res.json({ data: calls, total: calls.length })
    }

    res.json({ data: store.calls, total: store.calls.length })
  } catch (error) {
    next(error)
  }
})

app.get('/api/messages', authenticate, async (_req, res, next) => {
  try {
    if (isMongoReady()) {
      const { data: leads } = await listLeads()
      const messages = leads.flatMap((lead) => (lead.messages || []).map((message) => ({ leadId: lead.id, leadName: lead.name, ...message })))
      return res.json({ data: messages, total: messages.length })
    }

    res.json({ data: store.messages, total: store.messages.length })
  } catch (error) {
    next(error)
  }
})

app.post('/api/capture/forms', captureRateLimiter, async (req, res, next) => {
  try {
    const payload = leadSchema.parse({
      ...req.body,
      source: req.body.source || 'website',
      consent: {
        termsAccepted: req.body.termsAccepted,
        marketingOptIn: req.body.marketingOptIn,
        privacyAcceptedAt: new Date().toISOString(),
        captureMethod: req.body.captureMethod || 'landing_page',
      },
      sourceMeta: {
        formId: req.body.formId,
        campaignId: req.body.campaignId,
        utmSource: req.body.utmSource,
        utmCampaign: req.body.utmCampaign,
      },
    })

    const lead = await createLead(payload, { name: 'Public Capture', id: 'public-form', ipAddress: req.ip })
    res.status(201).json({ data: lead })
  } catch (error) {
    next(error)
  }
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

app.post('/api/webhooks/meta-ads', webhookRateLimiter, verifyMetaSignature, async (req, res, next) => {
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
        interestLevel: 'high',
        engagementLevel: 'high',
        sourceMeta: { rawWebhook: req.body },
      },
      null
    )

    return res.status(201).json({ received: true, leadId: lead.id })
  } catch (error) {
    return next(error)
  }
})

app.post('/api/webhooks/ivr', webhookRateLimiter, verifyTwilioSignature, async (req, res, next) => {
  try {
    let lead = (req.body.leadId ? await findLead(req.body.leadId) : null) || await findLeadByPhone(req.body.from || req.body.phone)

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
          interestLevel: 'high',
          engagementLevel: 'medium',
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

    if (isMongoReady()) {
      await Lead.findByIdAndUpdate(lead.id, lead, { new: true })
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

app.post('/api/webhooks/whatsapp', webhookRateLimiter, verifyWhatsAppSignature, async (req, res, next) => {
  try {
    let lead = (req.body.leadId ? await findLead(req.body.leadId) : null) || await findLeadByPhone(req.body.from || req.body.phone)

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
          interestLevel: 'high',
          engagementLevel: 'high',
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

    if (isMongoReady()) {
      await Lead.findByIdAndUpdate(lead.id, lead, { new: true })
    }

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
  return res.status(error.statusCode || 500).json({ message: error.statusCode ? error.message : 'Internal server error' })
})

// Cached Mongo connection promise so concurrent serverless invocations only
// trigger a single connection attempt during cold start.
let mongoConnectionPromise = null

export async function connectMongo() {
  if (!process.env.MONGO_URI) {
    if (!global.__mongoFallbackWarned) {
      console.warn('No MONGO_URI provided. Persistent CRM data is disabled until MongoDB is configured.')
      global.__mongoFallbackWarned = true
    }
    return null
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection
  }

  if (!mongoConnectionPromise) {
    mongoConnectionPromise = mongoose
      .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 })
      .then((conn) => {
        console.log('MongoDB connected')
        return conn
      })
      .catch((error) => {
        console.warn('MongoDB connection failed. Persistent CRM data is unavailable.')
        console.warn(error.message)
        mongoConnectionPromise = null
        return null
      })
  }

  return mongoConnectionPromise
}

// Kick off Mongo connection on module load (non-blocking) so the first request
// does not pay the full latency.
connectMongo()

// Only start the HTTP listener when running as a standalone Node process.
// In Vercel (and other serverless platforms) the platform will import the app
// and invoke it directly, so we must not bind to a port.
const isServerless = Boolean(process.env.VERCEL) || process.env.SERVERLESS === '1'

if (!isServerless) {
  const httpServer = app.listen(PORT, () => {
    console.log(`Lead management API listening on http://localhost:${PORT}`)
  })
  attachRealtime(httpServer)
  console.log('Realtime WebSocket endpoint available at ws://localhost:' + PORT + '/api/realtime')
}

export default app
