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
    value: { type: Number, default: 0 },
    assignedTo: { type: String, required: true },
    assignedUserName: String,
    department: String,
    requiredSkill: String,
    tags: [String],
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
    },
  },
  { timestamps: true }
)

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['admin', 'manager', 'sales', 'viewer'], default: 'sales' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  },
  { timestamps: true }
)

const activityLogSchema = new mongoose.Schema(
  {
    actorId: String,
    actorName: String,
    action: { type: String, required: true },
    entityType: { type: String, enum: ['lead', 'client', 'call', 'message', 'auth', 'workflow'], required: true },
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

export const Lead = mongoose.models.Lead || mongoose.model('Lead', leadSchema)
export const User = mongoose.models.User || mongoose.model('User', userSchema)
export const ActivityLog = mongoose.models.ActivityLog || mongoose.model('ActivityLog', activityLogSchema)
export const RefreshToken = mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema)
