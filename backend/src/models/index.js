import mongoose from 'mongoose'

const callLogSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ['twilio', 'exotel', 'manual'], default: 'manual' },
    direction: { type: String, enum: ['inbound', 'outbound'], default: 'outbound' },
    status: { type: String, enum: ['answered', 'missed', 'failed'], default: 'answered' },
    duration: { type: Number, default: 0 },
    timestamp: { type: Date, default: Date.now },
    recordingUrl: String,
    notes: String,
  },
  { _id: true }
)

const messageSchema = new mongoose.Schema(
  {
    channel: { type: String, enum: ['whatsapp', 'sms', 'email'], default: 'whatsapp' },
    direction: { type: String, enum: ['inbound', 'outbound'], default: 'outbound' },
    body: { type: String, required: true },
    templateName: String,
    status: { type: String, enum: ['sent', 'delivered', 'read', 'failed'], default: 'sent' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
)

const timelineSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['call', 'message', 'note', 'status', 'system'], required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: true }
)

const followUpStepSchema = new mongoose.Schema(
  {
    dayOffset: { type: Number, required: true },
    channel: { type: String, enum: ['email', 'sms', 'whatsapp', 'task'], required: true },
    status: { type: String, enum: ['pending', 'sent', 'skipped'], default: 'pending' },
    scheduledFor: { type: Date, required: true },
    templateName: String,
    message: String,
  },
  { _id: true }
)

const leadSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    company: { type: String, default: 'Independent' },
    source: {
      type: String,
      enum: ['manual', 'meta_ads', 'api', 'whatsapp', 'ivr', 'website', 'referral', 'linkedin', 'email', 'event', 'other'],
      default: 'manual',
    },
    status: {
      type: String,
      enum: ['new', 'contacted', 'interested', 'not_interested', 'converted'],
      default: 'new',
    },
    notes: String,
    score: { type: Number, default: 60 },
    segment: { type: String, enum: ['hot', 'warm', 'cold'], default: 'warm' },
    value: { type: Number, default: 0 },
    budget: Number,
    interestLevel: { type: String, enum: ['low', 'medium', 'high'] },
    engagementLevel: { type: String, enum: ['low', 'medium', 'high'] },
    assignedTo: { type: String, required: true },
    assignedUserName: String,
    department: String,
    requiredSkill: String,
    tags: [String],
    location: {
      city: String,
      state: String,
      country: String,
      address: String,
    },
    consent: {
      termsAccepted: { type: Boolean, default: false },
      marketingOptIn: { type: Boolean, default: false },
      privacyAcceptedAt: Date,
      ipAddress: String,
      captureMethod: String,
    },
    sourceMeta: mongoose.Schema.Types.Mixed,
    lastContacted: Date,
    nextFollowUp: Date,
    lastContactChannel: String,
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    aiSummary: String,
    callLogs: [callLogSchema],
    messages: [messageSchema],
    timeline: [timelineSchema],
    automation: {
      autoAssigned: { type: Boolean, default: true },
      lastWorkflow: String,
      chatbotEnabled: { type: Boolean, default: true },
      abVariant: String,
      lastNotifiedAt: Date,
      lastSyncedAt: Date,
      followUpSequence: [followUpStepSchema],
    },
  },
  { timestamps: true }
)

leadSchema.index(
  { email: 1 },
  { unique: true, sparse: true, collation: { locale: 'en', strength: 2 } }
)
leadSchema.index({ phone: 1 }, { unique: true, sparse: true })
leadSchema.index({ source: 1, status: 1, createdAt: -1 })
leadSchema.index({ assignedTo: 1, nextFollowUp: 1 })

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'sales', 'viewer'], default: 'sales' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    department: { type: String, enum: ['inbound', 'outbound', 'enterprise', 'support'] },
    skills: [String],
    maxActiveLeads: Number,
    isAvailable: { type: Boolean, default: true },
    avatar: String,
    lastActive: Date,
  },
  { timestamps: true }
)

const activityLogSchema = new mongoose.Schema(
  {
    actorId: String,
    actorName: String,
    action: { type: String, required: true },
    entityType: { type: String, enum: ['lead', 'client', 'deal', 'task', 'call', 'message', 'auth', 'workflow'], required: true },
    entityId: String,
    metadata: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
)

const refreshTokenSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
)

const clientSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    company: { type: String, required: true },
    industry: String,
    address: String,
    website: String,
    status: { type: String, enum: ['active', 'inactive', 'churned'], default: 'active' },
    segment: { type: String, enum: ['startup', 'smb', 'enterprise', 'vip'] },
    accountOwnerId: String,
    accountOwnerName: String,
    healthScore: Number,
    renewalDate: Date,
    lastContactChannel: { type: String, enum: ['call', 'whatsapp', 'email', 'note', 'system'] },
    lifetimeValue: { type: Number, default: 0 },
    totalDeals: { type: Number, default: 0 },
    tags: [String],
    notes: String,
    lastContact: Date,
    callLogs: [callLogSchema],
    messages: [messageSchema],
    timeline: [timelineSchema],
  },
  { timestamps: true }
)

clientSchema.index(
  { email: 1 },
  { unique: true, sparse: true, collation: { locale: 'en', strength: 2 } }
)
clientSchema.index({ phone: 1 }, { unique: true, sparse: true })

const commentSchema = new mongoose.Schema(
  {
    authorId: String,
    authorName: String,
    body: { type: String, required: true },
    mentions: [String],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
)

const dealSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    clientId: String,
    clientName: { type: String, required: true, default: 'Unassigned' },
    value: { type: Number, required: true, min: 0 },
    stage: {
      type: String,
      enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'],
      default: 'prospecting',
    },
    probability: { type: Number, min: 0, max: 100, default: 20 },
    expectedCloseDate: { type: Date, required: true },
    actualCloseDate: Date,
    assignedTo: String,
    description: String,
    activities: [mongoose.Schema.Types.Mixed],
    stageMovedAt: Date,
    lostReason: String,
    nextFollowUp: Date,
    tags: [String],
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    comments: [commentSchema],
  },
  { timestamps: true }
)

dealSchema.index({ stage: 1, expectedCloseDate: 1 })
dealSchema.index({ assignedTo: 1, stage: 1 })

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: String,
    status: { type: String, enum: ['pending', 'in-progress', 'completed', 'cancelled'], default: 'pending' },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    dueDate: { type: Date, required: true },
    assignedTo: String,
    relatedTo: {
      type: { type: String, enum: ['lead', 'client', 'deal'] },
      id: String,
      name: String,
    },
    completedAt: Date,
    overdueReason: String,
    overdueNotifiedAt: Date,
    comments: [commentSchema],
  },
  { timestamps: true }
)

taskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 })

export const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema)
export const User = mongoose.models.User || mongoose.model('User', userSchema)
export const Client = mongoose.models.Client || mongoose.model('Client', clientSchema)
export const Deal = mongoose.models.Deal || mongoose.model('Deal', dealSchema)
export const Task = mongoose.models.Task || mongoose.model('Task', taskSchema)
export const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema)
export const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema)
