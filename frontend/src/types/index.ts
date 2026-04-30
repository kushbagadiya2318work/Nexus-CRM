export interface User {
  id: string
  name: string
  email: string
  avatar?: string
  role: 'admin' | 'manager' | 'sales' | 'viewer'
  status: 'active' | 'inactive'
  department?: 'inbound' | 'outbound' | 'enterprise' | 'support'
  skills?: string[]
  maxActiveLeads?: number
  isAvailable?: boolean
  createdAt: string
  lastActive: string
}

export type LeadSource =
  | 'manual'
  | 'meta_ads'
  | 'api'
  | 'whatsapp'
  | 'ivr'
  | 'website'
  | 'referral'
  | 'linkedin'
  | 'email'
  | 'event'
  | 'other'

export type LeadStatus =
  | 'new'
  | 'contacted'
  | 'interested'
  | 'not_interested'
  | 'converted'
  | 'qualified'
  | 'proposal'
  | 'negotiation'
  | 'won'
  | 'lost'

export interface LeadCallLog {
  id: string
  provider: 'twilio' | 'exotel' | 'manual'
  direction: 'inbound' | 'outbound'
  status: 'answered' | 'missed' | 'failed'
  duration: number
  timestamp: string
  recordingUrl?: string
  notes?: string
}

export interface LeadMessage {
  id: string
  channel: 'whatsapp' | 'sms' | 'email'
  direction: 'inbound' | 'outbound'
  body: string
  timestamp: string
  templateName?: string
  status?: 'sent' | 'delivered' | 'read' | 'failed'
}

export interface LeadTimelineEntry {
  id: string
  type: 'call' | 'message' | 'note' | 'status' | 'system'
  title: string
  description: string
  timestamp: string
}

export interface Lead {
  id: string
  name: string
  email: string
  phone?: string
  company: string
  title?: string
  source: LeadSource
  status: LeadStatus
  score: number
  value: number
  assignedTo: string
  assignedUserName?: string
  department?: string
  requiredSkill?: string
  tags: string[]
  notes?: string
  lastActivity: string
  lastContacted?: string
  lastContactChannel?: 'call' | 'whatsapp' | 'email' | 'note' | 'system'
  nextFollowUp?: string
  priority?: 'low' | 'medium' | 'high'
  recordingUrl?: string
  conversationPreview?: string
  aiSummary?: string
  createdAt: string
  aiInsights?: string[]
  callLogs?: LeadCallLog[]
  messages?: LeadMessage[]
  timeline?: LeadTimelineEntry[]
  automation?: {
    autoAssigned: boolean
    lastWorkflow?: string
    chatbotEnabled?: boolean
  }
  callIntelligence?: CallIntelligence[]
  location?: {
    lat: number
    lng: number
    city?: string
    country?: string
    address?: string
  }
}

export interface Client {
  id: string
  name: string
  email: string
  phone?: string
  company: string
  industry?: string
  address?: string
  website?: string
  status: 'active' | 'inactive' | 'churned'
  segment?: 'startup' | 'smb' | 'enterprise' | 'vip'
  accountOwnerId?: string
  accountOwnerName?: string
  healthScore?: number
  renewalDate?: string
  lastContactChannel?: 'call' | 'whatsapp' | 'email' | 'note' | 'system'
  lifetimeValue: number
  totalDeals: number
  tags: string[]
  notes?: string
  lastContact: string
  callLogs?: LeadCallLog[]
  messages?: LeadMessage[]
  timeline?: LeadTimelineEntry[]
  createdAt: string
}

export interface Deal {
  id: string
  name: string
  clientId: string
  clientName: string
  value: number
  stage: 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed-won' | 'closed-lost'
  probability: number
  expectedCloseDate: string
  actualCloseDate?: string
  assignedTo: string
  description?: string
  activities: Activity[]
  createdAt: string
  updatedAt: string
  // Automation fields
  stageMovedAt?: string
  lostReason?: string
  nextFollowUp?: string
  tags?: string[]
  priority?: 'low' | 'medium' | 'high'
  comments?: Comment[]
}

// ── Collaboration ──────────────────────────────────────────────────────────────

export interface Comment {
  id: string
  authorId: string
  authorName: string
  body: string
  mentions: string[]   // user IDs that were @-mentioned
  createdAt: string
}

export interface Task {
  id: string
  title: string
  description?: string
  status: 'pending' | 'in-progress' | 'completed' | 'cancelled'
  priority: 'low' | 'medium' | 'high'
  dueDate: string
  assignedTo: string
  relatedTo?: {
    type: 'lead' | 'client' | 'deal'
    id: string
    name: string
  }
  createdAt: string
  completedAt?: string
  overdueReason?: string
  overdueNotifiedAt?: string
  comments?: Comment[]
}

export interface Activity {
  id: string
  type: 'call' | 'email' | 'meeting' | 'note' | 'task' | 'deal' | 'lead'
  description: string
  userId: string
  userName: string
  relatedTo?: {
    type: 'lead' | 'client' | 'deal'
    id: string
    name: string
  }
  createdAt: string
}

export interface Invoice {
  id: string
  clientId: string
  clientName: string
  dealId?: string
  amount: number
  tax: number
  discount: number
  total: number
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  dueDate: string
  paidDate?: string
  items: InvoiceItem[]
  notes?: string
  createdAt: string
}

export interface InvoiceItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  total: number
}

export interface DashboardStats {
  totalRevenue: number
  revenueChange: number
  activeDeals: number
  dealsChange: number
  newLeads: number
  leadsChange: number
  conversionRate: number
  conversionChange: number
}

export interface PipelineStage {
  name: string
  count: number
  value: number
  color: string
}

export interface TeamMember {
  id: string
  name: string
  avatar?: string
  deals: number
  revenue: number
  activities: number
}

export interface AIInsight {
  id: string
  type: 'alert' | 'warning' | 'opportunity' | 'suggestion'
  title: string
  description: string
  actionText: string
  actionLink?: string
  createdAt: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

// ── Workflow Builder ───────────────────────────────────────────────────────────

export type WorkflowTriggerType =
  | 'lead_score_above'
  | 'lead_score_below'
  | 'lead_status_changed'
  | 'deal_stage_changed'
  | 'no_contact_days'
  | 'lead_source'
  | 'deal_value_above'
  | 'task_overdue'

export type WorkflowActionType =
  | 'send_whatsapp'
  | 'send_email'
  | 'send_sms'
  | 'create_task'
  | 'assign_to_user'
  | 'add_tag'
  | 'change_lead_status'
  | 'change_deal_stage'
  | 'send_linkedin'
  | 'notify_admin'

export interface WorkflowCondition {
  id: string
  trigger: WorkflowTriggerType
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains'
  value: string
}

export interface WorkflowAction {
  id: string
  type: WorkflowActionType
  config: {
    message?: string
    subject?: string
    assignTo?: string
    tag?: string
    status?: string
    stage?: string
    taskTitle?: string
    taskPriority?: 'low' | 'medium' | 'high'
    delayMinutes?: number
  }
}

export interface Workflow {
  id: string
  name: string
  description: string
  isActive: boolean
  triggerLogic: 'AND' | 'OR'
  conditions: WorkflowCondition[]
  actions: WorkflowAction[]
  executionCount: number
  lastExecutedAt?: string
  createdAt: string
  createdBy: string
}

// ── Drip Campaigns ─────────────────────────────────────────────────────────────

export type DripChannel = 'email' | 'whatsapp' | 'sms' | 'task'

export interface DripStep {
  id: string
  dayOffset: number       // days after enrollment: 0 = immediately
  channel: DripChannel
  subject?: string        // email subject
  message: string
  templateName?: string
}

export type DripCampaignStatus = 'draft' | 'active' | 'paused' | 'archived'

export interface DripCampaign {
  id: string
  name: string
  description: string
  status: DripCampaignStatus
  targetSegment: string   // e.g. "enterprise", "startup", "all"
  steps: DripStep[]
  enrolledCount: number
  sentCount: number
  replyCount: number
  createdAt: string
  createdBy: string
}

// ── Call Intelligence ──────────────────────────────────────────────────────────

export type CallMomentType =
  | 'competitor_mention'
  | 'budget_concern'
  | 'objection'
  | 'positive_signal'
  | 'next_step'
  | 'pain_point'

export interface CallMoment {
  id: string
  type: CallMomentType
  label: string           // e.g. "Competitor Mentioned: Salesforce"
  quote: string           // verbatim excerpt
  timestampSec: number    // seconds into call
}

export interface CallIntelligence {
  id: string
  provider: 'zoom' | 'teams' | 'meet' | 'manual'
  recordedAt: string
  durationSec: number
  participantNames: string[]
  overallSentiment: 'positive' | 'neutral' | 'negative'
  sentimentScore: number   // 0-100
  summary: string
  moments: CallMoment[]
  syncedToClientAt?: string
  syncedToClientId?: string
}

// ── Content Suggestions ────────────────────────────────────────────────────────

export type ContentAssetType = 'case_study' | 'whitepaper' | 'spec_sheet' | 'demo_video' | 'roi_calculator'

export interface ContentAsset {
  id: string
  type: ContentAssetType
  title: string
  description: string
  tags: string[]          // e.g. ['enterprise', 'security', 'integration']
  relevanceReason: string // Why the AI is recommending this
  url: string
}

// ── CPQ (Configure, Price, Quote) ─────────────────────────────────────────────

export interface QuoteLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  discount: number        // percentage 0-100
  total: number           // computed: qty * unitPrice * (1 - discount/100)
}

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired'

export interface Quote {
  id: string
  dealId: string
  dealName: string
  clientId: string
  clientName: string
  quoteNumber: string     // e.g. "Q-2026-001"
  status: QuoteStatus
  lineItems: QuoteLineItem[]
  globalDiscount: number  // percentage applied after line-level discounts
  taxRate: number         // percentage e.g. 10
  subtotal: number
  discountAmount: number
  taxAmount: number
  total: number
  currency: string        // "USD"
  validUntil: string      // ISO date
  paymentTerms: string    // e.g. "Net 30"
  notes: string
  signatureRequired: boolean
  signedAt?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ── Renewal & Churn Risk ───────────────────────────────────────────────────────

export type ChurnRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export interface ChurnRiskSignal {
  label: string
  detail: string
  severity: 'info' | 'warning' | 'critical'
}
