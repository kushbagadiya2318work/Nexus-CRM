import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Lead, Client, Deal, Task, Activity, Invoice, DashboardStats, AIInsight, ChatMessage, Workflow, DripCampaign, Comment, Quote } from '@/types'

interface CRMState {
  // Auth
  currentUser: User | null
  isAuthenticated: boolean
  setCurrentUser: (user: User | null) => void
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void

  // Data
  users: User[]
  leads: Lead[]
  clients: Client[]
  deals: Deal[]
  tasks: Task[]
  activities: Activity[]
  invoices: Invoice[]
  aiInsights: AIInsight[]
  chatMessages: ChatMessage[]
  workflows: Workflow[]
  dripCampaigns: DripCampaign[]
  quotes: Quote[]

  // Actions
  setUsers: (users: User[]) => void
  setLeads: (leads: Lead[]) => void
  setClients: (clients: Client[]) => void
  setDeals: (deals: Deal[]) => void
  setTasks: (tasks: Task[]) => void
  setActivities: (activities: Activity[]) => void
  setInvoices: (invoices: Invoice[]) => void
  setAIInsights: (insights: AIInsight[]) => void
  addChatMessage: (message: ChatMessage) => void
  clearChat: () => void
  addWorkflow: (w: Workflow) => void
  updateWorkflow: (id: string, updates: Partial<Workflow>) => void
  deleteWorkflow: (id: string) => void
  addDripCampaign: (c: DripCampaign) => void
  updateDripCampaign: (id: string, updates: Partial<DripCampaign>) => void
  deleteDripCampaign: (id: string) => void
  addQuote: (q: Quote) => void
  updateQuote: (id: string, updates: Partial<Quote>) => void
  deleteQuote: (id: string) => void

  // CRUD operations
  addLead: (lead: Lead) => void
  updateLead: (id: string, updates: Partial<Lead>) => void
  deleteLead: (id: string) => void
  addClient: (client: Client) => void
  updateClient: (id: string, updates: Partial<Client>) => void
  deleteClient: (id: string) => void
  addTask: (task: Task) => void
  updateTask: (id: string, updates: Partial<Task>) => void
  deleteTask: (id: string) => void
  addComment: (entityType: 'task' | 'deal', entityId: string, comment: Comment) => void
  addDeal: (deal: Deal) => void
  updateDeal: (id: string, updates: Partial<Deal>) => void
  deleteDeal: (id: string) => void

  // Lead conversion
  convertLead: (leadId: string, dealOverrides: {
    dealName: string
    dealValue: number
    dealStage: Deal['stage']
    dealAssignedTo: string
    expectedCloseDate: string
    notes?: string
  }) => { deal: Deal; client: Client }

  // Computed
  getDashboardStats: () => DashboardStats
  getPipelineData: () => { name: string; count: number; value: number; color: string }[]
  getLeadSources: () => { source: string; count: number; percentage: number; color: string }[]
  getTeamPerformance: () => { id: string; name: string; deals: number; revenue: number; activities: number }[]
  getRevenueData: () => { month: string; current: number; previous: number }[]
}

// Sample data for demonstration
const sampleUsers: User[] = [
  {
    id: '1',
    name: 'Sarah Chen',
    email: 'sarah@nexus.com',
    avatar: 'https://i.pravatar.cc/150?u=sarah',
    role: 'manager',
    status: 'active',
    department: 'enterprise',
    skills: ['enterprise', 'closing', 'strategy'],
    maxActiveLeads: 6,
    isAvailable: true,
    createdAt: '2023-01-15',
    lastActive: '2024-01-10T10:30:00',
  },
  {
    id: '2',
    name: 'Mike Ross',
    email: 'mike@nexus.com',
    avatar: 'https://i.pravatar.cc/150?u=mike',
    role: 'sales',
    status: 'active',
    department: 'inbound',
    skills: ['meta_ads', 'whatsapp', 'demo'],
    maxActiveLeads: 5,
    isAvailable: true,
    createdAt: '2023-02-20',
    lastActive: '2024-01-10T09:45:00',
  },
  {
    id: '3',
    name: 'Emma Davis',
    email: 'emma@nexus.com',
    avatar: 'https://i.pravatar.cc/150?u=emma',
    role: 'sales',
    status: 'active',
    department: 'outbound',
    skills: ['ivr', 'email', 'follow_up'],
    maxActiveLeads: 4,
    isAvailable: true,
    createdAt: '2023-03-10',
    lastActive: '2024-01-09T16:20:00',
  },
  {
    id: '4',
    name: 'John Smith',
    email: 'john@nexus.com',
    avatar: 'https://i.pravatar.cc/150?u=john',
    role: 'sales',
    status: 'active',
    department: 'enterprise',
    skills: ['enterprise', 'negotiation', 'proposal'],
    maxActiveLeads: 5,
    isAvailable: true,
    createdAt: '2023-04-05',
    lastActive: '2024-01-10T11:15:00',
  },
  {
    id: '5',
    name: 'Lisa Wong',
    email: 'lisa@nexus.com',
    avatar: 'https://i.pravatar.cc/150?u=lisa',
    role: 'sales',
    status: 'active',
    department: 'support',
    skills: ['onboarding', 'retention', 'support'],
    maxActiveLeads: 3,
    isAvailable: true,
    createdAt: '2023-05-12',
    lastActive: '2024-01-08T14:30:00',
  },
]

const sampleLeads: Lead[] = [
  {
    id: '1',
    name: 'Robert Johnson',
    email: 'robert@techcorp.com',
    phone: '+1-555-0123',
    company: 'TechCorp Industries',
    title: 'CTO',
    source: 'meta_ads',
    status: 'new',
    score: 91,
    value: 125000,
    assignedTo: '2',
    assignedUserName: 'Mike Ross',
    tags: ['enterprise', 'high-intent'],
    notes: 'Filled Meta instant form asking for an enterprise demo.',
    lastActivity: '2026-04-14T09:10:00',
    createdAt: '2026-04-14T08:50:00',
    lastContacted: '2026-04-14T09:10:00',
    lastContactChannel: 'call',
    nextFollowUp: '2026-04-15T11:00:00',
    priority: 'high',
    conversationPreview: 'Thanks for requesting a demo. I can help with pricing and onboarding.',
    aiSummary: 'Strong purchase intent detected from Meta form answers and phone engagement.',
    aiInsights: ['Company size 500+', 'Decision maker confirmed', 'Best time to call: 11 AM'],
    callLogs: [
      {
        id: 'call-1',
        provider: 'twilio',
        direction: 'outbound',
        status: 'answered',
        duration: 356,
        timestamp: '2026-04-14T09:10:00',
        recordingUrl: 'https://example.com/recordings/robert-demo.mp3',
        notes: 'Requested an enterprise walk-through and multi-user pricing.',
      },
    ],
    messages: [
      {
        id: 'msg-1',
        channel: 'whatsapp',
        direction: 'outbound',
        body: 'Hi Robert, thanks for your interest. I have shared the demo schedule.',
        templateName: 'new_lead_welcome',
        status: 'delivered',
        timestamp: '2026-04-14T09:12:00',
      },
    ],
    timeline: [
      {
        id: 'timeline-1',
        type: 'message',
        title: 'Welcome sequence sent',
        description: 'Automated WhatsApp intro template sent after Meta Ads capture.',
        timestamp: '2026-04-14T09:12:00',
      },
    ],
    automation: { autoAssigned: true, lastWorkflow: 'meta-ads-welcome', chatbotEnabled: true },
    location: { lat: 37.7749, lng: -122.4194, city: 'San Francisco', country: 'US', address: '1 Market St, San Francisco, CA' },
  },
  {
    id: '2',
    name: 'Amanda Lee',
    email: 'amanda@globalsys.com',
    phone: '+1-555-0456',
    company: 'Global Systems Ltd',
    title: 'VP of Operations',
    source: 'manual',
    status: 'contacted',
    score: 77,
    value: 98000,
    assignedTo: '3',
    assignedUserName: 'Emma Davis',
    tags: ['mid-market'],
    notes: 'Lead entered manually after trade-show conversation.',
    lastActivity: '2026-04-13T17:40:00',
    createdAt: '2026-04-13T15:15:00',
    lastContacted: '2026-04-13T17:40:00',
    lastContactChannel: 'whatsapp',
    nextFollowUp: '2026-04-16T10:30:00',
    priority: 'medium',
    conversationPreview: 'Shared brochure and solution summary on WhatsApp.',
    aiInsights: ['Responsive on WhatsApp', 'Needs ROI calculator'],
    callLogs: [
      {
        id: 'call-2',
        provider: 'twilio',
        direction: 'outbound',
        status: 'answered',
        duration: 182,
        timestamp: '2026-04-13T16:20:00',
        notes: 'Interested in operational reporting and automation.',
      },
    ],
    messages: [
      {
        id: 'msg-2',
        channel: 'whatsapp',
        direction: 'outbound',
        body: 'Sharing the brochure and case study we discussed.',
        templateName: 'brochure_followup',
        status: 'read',
        timestamp: '2026-04-13T17:40:00',
      },
    ],
    timeline: [
      {
        id: 'timeline-2',
        type: 'call',
        title: 'Discovery call completed',
        description: 'Sales rep mapped current workflow gaps and buying timeline.',
        timestamp: '2026-04-13T16:20:00',
      },
    ],
    automation: { autoAssigned: true, lastWorkflow: 'manual-lead-followup', chatbotEnabled: false },
    location: { lat: 40.7128, lng: -74.006, city: 'New York', country: 'US', address: '350 5th Ave, New York, NY' },
  },
  {
    id: '3',
    name: 'David Park',
    email: 'david@innovatelabs.com',
    phone: '+1-555-0678',
    company: 'Innovation Labs',
    title: 'Founder',
    source: 'whatsapp',
    status: 'interested',
    score: 84,
    value: 76000,
    assignedTo: '2',
    assignedUserName: 'Mike Ross',
    tags: ['startup'],
    notes: 'Inbound WhatsApp query from website chat-to-WhatsApp widget.',
    lastActivity: '2026-04-14T07:45:00',
    createdAt: '2026-04-12T12:20:00',
    lastContacted: '2026-04-14T07:45:00',
    lastContactChannel: 'whatsapp',
    nextFollowUp: '2026-04-15T09:30:00',
    priority: 'high',
    conversationPreview: 'Requested implementation timeline and API documentation.',
    aiInsights: ['Asked about integrations', 'High likelihood of 14-day close'],
    messages: [
      {
        id: 'msg-3',
        channel: 'whatsapp',
        direction: 'inbound',
        body: 'Can your CRM integrate with WhatsApp and Meta lead forms?',
        status: 'read',
        timestamp: '2026-04-14T07:45:00',
      },
    ],
    timeline: [
      {
        id: 'timeline-3',
        type: 'status',
        title: 'Marked as interested',
        description: 'Lead asked for implementation scope and pricing breakdown.',
        timestamp: '2026-04-14T07:45:00',
      },
    ],
    automation: { autoAssigned: true, lastWorkflow: 'whatsapp-followup', chatbotEnabled: true },
    location: { lat: 47.6062, lng: -122.3321, city: 'Seattle', country: 'US', address: '1301 5th Ave, Seattle, WA' },
  },
  {
    id: '4',
    name: 'Jennifer Martinez',
    email: 'jennifer@acme.com',
    phone: '+1-555-0789',
    company: 'Acme Corporation',
    title: 'Director of Sales',
    source: 'api',
    status: 'not_interested',
    score: 41,
    value: 65000,
    assignedTo: '4',
    assignedUserName: 'John Smith',
    tags: ['enterprise'],
    notes: 'Inbound API lead did not have budget this quarter.',
    lastActivity: '2026-04-11T11:25:00',
    createdAt: '2026-04-10T10:00:00',
    lastContacted: '2026-04-11T11:25:00',
    lastContactChannel: 'call',
    nextFollowUp: '2026-05-01T10:00:00',
    priority: 'low',
    conversationPreview: 'Asked to reconnect next quarter.',
    aiInsights: ['Budget objection', 'Re-engage in 21 days'],
    callLogs: [
      {
        id: 'call-4',
        provider: 'exotel',
        direction: 'outbound',
        status: 'missed',
        duration: 0,
        timestamp: '2026-04-11T10:45:00',
        notes: 'Call not answered. Automated WhatsApp reminder sent.',
      },
    ],
    timeline: [
      {
        id: 'timeline-4',
        type: 'system',
        title: 'Missed-call workflow triggered',
        description: 'No answer detected, so the CRM sent an automated follow-up message.',
        timestamp: '2026-04-11T10:46:00',
      },
    ],
    automation: { autoAssigned: true, lastWorkflow: 'missed-call-retry', chatbotEnabled: true },
    location: { lat: 34.0522, lng: -118.2437, city: 'Los Angeles', country: 'US', address: '633 W 5th St, Los Angeles, CA' },
  },
  {
    id: '5',
    name: 'Michael Brown',
    email: 'michael@futuredyn.com',
    phone: '+1-555-0991',
    company: 'Future Dynamics',
    title: 'COO',
    source: 'ivr',
    status: 'converted',
    score: 95,
    value: 154000,
    assignedTo: '1',
    assignedUserName: 'Sarah Chen',
    tags: ['vip', 'converted'],
    notes: 'Closed after inbound IVR transfer and executive demo.',
    lastActivity: '2026-04-12T14:00:00',
    createdAt: '2026-04-08T09:30:00',
    lastContacted: '2026-04-12T14:00:00',
    lastContactChannel: 'call',
    nextFollowUp: '2026-04-20T11:00:00',
    priority: 'high',
    recordingUrl: 'https://example.com/recordings/futuredyn-close.mp3',
    conversationPreview: 'Contract signed. Kickoff scheduled for next week.',
    aiSummary: 'Lead moved through IVR to live rep with excellent conversion velocity.',
    aiInsights: ['Fastest converting lead this month', 'Reference account candidate'],
    callLogs: [
      {
        id: 'call-5',
        provider: 'twilio',
        direction: 'inbound',
        status: 'answered',
        duration: 612,
        timestamp: '2026-04-12T13:40:00',
        recordingUrl: 'https://example.com/recordings/futuredyn-close.mp3',
        notes: 'Contract verbally confirmed and onboarding date locked.',
      },
    ],
    timeline: [
      {
        id: 'timeline-5',
        type: 'status',
        title: 'Lead converted to client',
        description: 'Won after inbound IVR route and follow-up proposal approval.',
        timestamp: '2026-04-12T14:00:00',
      },
    ],
    automation: { autoAssigned: true, lastWorkflow: 'conversion-handoff', chatbotEnabled: false },
    location: { lat: 41.8781, lng: -87.6298, city: 'Chicago', country: 'US', address: '233 S Wacker Dr, Chicago, IL' },
  },
]

function createClientFromLead(lead: Lead): Client {
  const normalizedTags = Array.from(new Set([...(lead.tags || []), 'converted']))

  return {
    id: `client-${lead.id}`,
    name: lead.name,
    email: lead.email || `${lead.id}@client.local`,
    phone: lead.phone,
    company: lead.company,
    industry: lead.department ? `${lead.department} team` : 'General',
    segment: lead.value > 100000 ? 'enterprise' : lead.value > 50000 ? 'smb' : 'startup',
    accountOwnerId: lead.assignedTo,
    accountOwnerName: lead.assignedUserName,
    healthScore: Math.min(100, Math.max(65, lead.score || 75)),
    renewalDate: lead.nextFollowUp,
    lastContactChannel: lead.lastContactChannel,
    status: 'active',
    lifetimeValue: lead.value || 0,
    totalDeals: 1,
    tags: normalizedTags,
    notes: `Auto-created from converted lead ${lead.name}.`,
    lastContact: lead.lastContacted || lead.lastActivity || lead.createdAt,
    callLogs: lead.callLogs || [],
    messages: lead.messages || [],
    timeline: lead.timeline || [],
    createdAt: lead.createdAt,
  }
}

function mergeClientsWithConvertedLeads(clients: Client[], leads: Lead[]): Client[] {
  const merged = [...clients]

  for (const lead of leads) {
    if (!['converted', 'won'].includes(lead.status)) {
      continue
    }

    const exists = merged.some((client) =>
      client.email.toLowerCase() === lead.email.toLowerCase() ||
      client.company.toLowerCase() === lead.company.toLowerCase() ||
      ((client.phone || '').replace(/\D/g, '') !== '' && (client.phone || '').replace(/\D/g, '') === (lead.phone || '').replace(/\D/g, ''))
    )

    if (!exists) {
      merged.unshift(createClientFromLead(lead))
    }
  }

  return merged
}

const sampleClients: Client[] = [
  {
    id: '1',
    name: 'William Taylor',
    email: 'william@enterprise.com',
    phone: '+1-555-1111',
    company: 'Enterprise Solutions Inc',
    industry: 'Technology',
    segment: 'enterprise',
    accountOwnerId: '1',
    accountOwnerName: 'Sarah Chen',
    healthScore: 92,
    renewalDate: '2026-05-10T12:00:00',
    lastContactChannel: 'call',
    status: 'active',
    lifetimeValue: 450000,
    totalDeals: 5,
    tags: ['enterprise', 'vip'],
    notes: 'Strategic account with annual renewal due next month.',
    lastContact: '2026-04-12T15:00:00',
    callLogs: [
      {
        id: 'client-call-1',
        provider: 'twilio',
        direction: 'outbound',
        status: 'answered',
        duration: 420,
        timestamp: '2026-04-12T15:00:00',
        notes: 'Quarterly business review completed from CRM.',
      },
    ],
    messages: [
      {
        id: 'client-message-1',
        channel: 'whatsapp',
        direction: 'outbound',
        body: 'Sharing the renewal summary and meeting notes.',
        status: 'read',
        timestamp: '2026-04-12T15:15:00',
      },
    ],
    timeline: [
      {
        id: 'client-timeline-1',
        type: 'call',
        title: 'Account review call',
        description: 'Client discussed upgrade opportunities and next renewal steps.',
        timestamp: '2026-04-12T15:00:00',
      },
    ],
    createdAt: '2022-06-15',
  },
  {
    id: '2',
    name: 'Sarah Wilson',
    email: 'sarah@startup.io',
    phone: '+1-555-2222',
    company: 'StartupXYZ',
    industry: 'SaaS',
    segment: 'startup',
    accountOwnerId: '5',
    accountOwnerName: 'Lisa Wong',
    healthScore: 78,
    renewalDate: '2026-06-20T10:30:00',
    lastContactChannel: 'email',
    status: 'active',
    lifetimeValue: 85000,
    totalDeals: 2,
    tags: ['startup'],
    notes: 'Needs onboarding assistance and monthly check-ins.',
    lastContact: '2026-04-09T10:30:00',
    callLogs: [],
    messages: [
      {
        id: 'client-message-2',
        channel: 'email',
        direction: 'outbound',
        body: 'Sent onboarding checklist and next-step summary.',
        status: 'delivered',
        timestamp: '2026-04-09T10:30:00',
      },
    ],
    timeline: [
      {
        id: 'client-timeline-2',
        type: 'message',
        title: 'Onboarding update sent',
        description: 'Client received onboarding documents and kickoff instructions.',
        timestamp: '2026-04-09T10:30:00',
      },
    ],
    createdAt: '2023-03-20',
  },
]

const sampleDeals: Deal[] = [
  {
    id: '1',
    name: 'TechCorp Enterprise License',
    clientId: '1',
    clientName: 'TechCorp Industries',
    value: 125000,
    stage: 'negotiation',
    probability: 85,
    expectedCloseDate: '2024-02-15',
    assignedTo: '1',
    description: 'Annual enterprise license for 500 users',
    activities: [],
    createdAt: '2023-11-15',
    updatedAt: '2024-01-09',
  },
  {
    id: '2',
    name: 'Global Systems Implementation',
    clientId: '2',
    clientName: 'Global Systems Ltd',
    value: 98000,
    stage: 'proposal',
    probability: 70,
    expectedCloseDate: '2024-02-28',
    assignedTo: '3',
    activities: [],
    createdAt: '2023-12-01',
    updatedAt: '2024-01-08',
  },
  {
    id: '3',
    name: 'Innovation Labs Pilot',
    clientId: '3',
    clientName: 'Innovation Labs',
    value: 76000,
    stage: 'qualification',
    probability: 60,
    expectedCloseDate: '2024-03-15',
    assignedTo: '2',
    activities: [],
    createdAt: '2023-12-10',
    updatedAt: '2024-01-07',
  },
]

const sampleTasks: Task[] = [
  {
    id: '1',
    title: 'Follow up with TechCorp',
    description: 'Send updated proposal with discount terms',
    status: 'pending',
    priority: 'high',
    dueDate: '2024-01-10',
    assignedTo: '1',
    relatedTo: { type: 'deal', id: '1', name: 'TechCorp Enterprise License' },
    createdAt: '2024-01-08',
  },
  {
    id: '2',
    title: 'Prepare proposal for Global Systems',
    status: 'in-progress',
    priority: 'high',
    dueDate: '2024-01-11',
    assignedTo: '3',
    relatedTo: { type: 'deal', id: '2', name: 'Global Systems Implementation' },
    createdAt: '2024-01-07',
  },
  {
    id: '3',
    title: 'Call Acme Corp CEO',
    status: 'pending',
    priority: 'medium',
    dueDate: '2024-01-10',
    assignedTo: '4',
    relatedTo: { type: 'lead', id: '4', name: 'Jennifer Martinez' },
    createdAt: '2024-01-09',
  },
]

const sampleActivities: Activity[] = [
  {
    id: '1',
    type: 'deal',
    description: 'Closed deal with TechCorp',
    userId: '1',
    userName: 'Sarah Chen',
    relatedTo: { type: 'deal', id: '1', name: 'TechCorp Enterprise License' },
    createdAt: '2024-01-10T10:23:00',
  },
  {
    id: '2',
    type: 'lead',
    description: 'Qualified lead from Innovation Labs',
    userId: '2',
    userName: 'Mike Ross',
    relatedTo: { type: 'lead', id: '3', name: 'David Park' },
    createdAt: '2024-01-10T09:45:00',
  },
  {
    id: '3',
    type: 'email',
    description: 'Sent follow-up emails to 15 leads',
    userId: 'ai',
    userName: 'AI Assistant',
    createdAt: '2024-01-10T09:12:00',
  },
]

const sampleAIInsights: AIInsight[] = [
  {
    id: '1',
    type: 'alert',
    title: 'Hot Lead Alert',
    description: 'Acme Corp showing 85% engagement - recommend immediate follow-up',
    actionText: 'View Lead',
    actionLink: '/leads/4',
    createdAt: '2024-01-10T08:00:00',
  },
  {
    id: '2',
    type: 'warning',
    title: 'Deal Risk Warning',
    description: 'TechStart Inc deal stalled for 14 days - suggest re-engagement',
    actionText: 'Take Action',
    actionLink: '/deals/5',
    createdAt: '2024-01-09T16:00:00',
  },
  {
    id: '3',
    type: 'opportunity',
    title: 'Revenue Opportunity',
    description: '3 enterprise prospects match your ideal customer profile this week',
    actionText: 'Explore',
    actionLink: '/leads',
    createdAt: '2024-01-09T10:00:00',
  },
]

const sampleWorkflows: Workflow[] = [
  {
    id: 'wf-1',
    name: 'High-Intent Lead Fast Track',
    description: 'When a lead score hits 90+, immediately assign to top rep and send personalized WhatsApp.',
    isActive: true,
    triggerLogic: 'AND',
    conditions: [
      { id: 'c1', trigger: 'lead_score_above', operator: 'greater_than', value: '90' },
    ],
    actions: [
      { id: 'a1', type: 'assign_to_user', config: { assignTo: '1' } },
      { id: 'a2', type: 'send_whatsapp', config: { message: 'Hi {{name}}, I noticed your interest in our platform. I\'d love to set up a quick 15-min call — when works for you?' } },
      { id: 'a3', type: 'create_task', config: { taskTitle: 'Follow up with high-intent lead', taskPriority: 'high' } },
    ],
    executionCount: 14,
    lastExecutedAt: '2026-04-15T10:30:00',
    createdAt: '2026-03-01T09:00:00',
    createdBy: '1',
  },
  {
    id: 'wf-2',
    name: 'Missed Call AutoRecover',
    description: 'If a call is missed, send a WhatsApp message and schedule a callback task.',
    isActive: true,
    triggerLogic: 'AND',
    conditions: [
      { id: 'c1', trigger: 'no_contact_days', operator: 'greater_than', value: '3' },
      { id: 'c2', trigger: 'lead_status_changed', operator: 'equals', value: 'contacted' },
    ],
    actions: [
      { id: 'a1', type: 'send_whatsapp', config: { message: 'Hi {{name}}, we missed connecting! Can we schedule a call at your convenience?' } },
      { id: 'a2', type: 'create_task', config: { taskTitle: 'Retry call for missed contact', taskPriority: 'medium' } },
    ],
    executionCount: 31,
    lastExecutedAt: '2026-04-14T14:10:00',
    createdAt: '2026-02-15T11:00:00',
    createdBy: '1',
  },
  {
    id: 'wf-3',
    name: 'Deal Lost Re-engagement',
    description: 'When a deal is marked as lost, notify the manager and schedule a 30-day re-engagement task.',
    isActive: false,
    triggerLogic: 'AND',
    conditions: [
      { id: 'c1', trigger: 'deal_stage_changed', operator: 'equals', value: 'closed-lost' },
    ],
    actions: [
      { id: 'a1', type: 'notify_admin', config: { message: 'Deal {{dealName}} was marked as lost.' } },
      { id: 'a2', type: 'add_tag', config: { tag: 're-engage' } },
      { id: 'a3', type: 'create_task', config: { taskTitle: 'Re-engage lost deal in 30 days', taskPriority: 'low' } },
    ],
    executionCount: 5,
    lastExecutedAt: '2026-04-10T09:00:00',
    createdAt: '2026-02-20T10:00:00',
    createdBy: '1',
  },
]

const sampleDripCampaigns: DripCampaign[] = [
  {
    id: 'dc-1',
    name: 'Enterprise Nurture Sequence',
    description: 'Multi-channel sequence for enterprise prospects who showed interest but didn\'t convert.',
    status: 'active',
    targetSegment: 'enterprise',
    steps: [
      { id: 's1', dayOffset: 0,  channel: 'email',    subject: 'Quick question about your goals', message: 'Hi {{name}}, I wanted to follow up on your interest in our platform...' },
      { id: 's2', dayOffset: 2,  channel: 'whatsapp', message: 'Hi {{name}}, just sent you an email. Would love to connect briefly this week!' },
      { id: 's3', dayOffset: 5,  channel: 'email',    subject: 'Case study: How TechCorp grew 3x', message: 'Sharing a quick success story that might be relevant...' },
      { id: 's4', dayOffset: 10, channel: 'task',     message: 'Manual call attempt for enterprise prospect' },
      { id: 's5', dayOffset: 14, channel: 'sms',      message: 'Hi {{name}}, this is Sarah from NexusAI. We have a special offer for enterprise teams this month.' },
    ],
    enrolledCount: 12,
    sentCount: 48,
    replyCount: 4,
    createdAt: '2026-03-10T10:00:00',
    createdBy: '1',
  },
  {
    id: 'dc-2',
    name: 'New Lead Welcome Flow',
    description: 'Onboard new inbound leads with immediate engagement and value content.',
    status: 'active',
    targetSegment: 'all',
    steps: [
      { id: 's1', dayOffset: 0, channel: 'whatsapp', message: 'Welcome {{name}}! Thanks for your interest in NexusAI CRM. I\'m Sarah, your dedicated account manager.' },
      { id: 's2', dayOffset: 1, channel: 'email',    subject: 'Your personalized demo is ready', message: 'Hi {{name}}, here\'s your personalized product walkthrough...' },
      { id: 's3', dayOffset: 3, channel: 'email',    subject: 'ROI Calculator — see your potential savings', message: 'Based on your company size, here\'s what you could save...' },
    ],
    enrolledCount: 38,
    sentCount: 92,
    replyCount: 11,
    createdAt: '2026-02-01T10:00:00',
    createdBy: '1',
  },
]

export const useCRMStore = create<CRMState>()(
  persist(
    (set, get) => ({
      // Auth
      currentUser: null,
      isAuthenticated: false,
      setCurrentUser: (user) => set({ currentUser: user, isAuthenticated: !!user }),
      login: async (email, password) => {
        // Simulate login
        const user = sampleUsers.find(u => u.email === email)
        if (user) {
          set({ currentUser: user, isAuthenticated: true })
          return true
        }
        // Default login for demo
        if (email === 'demo@nexus.com' && password === 'demo') {
          set({ currentUser: sampleUsers[0], isAuthenticated: true })
          return true
        }
        return false
      },
      logout: () => set({ currentUser: null, isAuthenticated: false }),

      // Data
      users: sampleUsers,
      leads: sampleLeads,
      clients: mergeClientsWithConvertedLeads(sampleClients, sampleLeads),
      deals: sampleDeals,
      tasks: sampleTasks,
      activities: sampleActivities,
      invoices: [],
      aiInsights: sampleAIInsights,
      workflows: sampleWorkflows,
      dripCampaigns: sampleDripCampaigns,
      quotes: [],
      chatMessages: [
        {
          id: '1',
          role: 'assistant',
          content: "Hi! I'm your AI sales assistant. How can I help you today?",
          timestamp: '2024-01-10T08:00:00',
        },
      ],

      // Actions
      setUsers: (users) => set({ users }),
      setLeads: (leads) => set((state) => ({ leads, clients: mergeClientsWithConvertedLeads(state.clients, leads) })),
      setClients: (clients) => set({ clients }),
      setDeals: (deals) => set({ deals }),
      setTasks: (tasks) => set({ tasks }),
      setActivities: (activities) => set({ activities }),
      setInvoices: (invoices) => set({ invoices }),
      setAIInsights: (insights) => set({ aiInsights: insights }),
      addChatMessage: (message) => set((state) => ({ 
        chatMessages: [...state.chatMessages, message] 
      })),
      clearChat: () => set({ chatMessages: [] }),
      addWorkflow: (w) => set((state) => ({ workflows: [...state.workflows, w] })),
      updateWorkflow: (id, updates) => set((state) => ({ workflows: state.workflows.map(w => w.id === id ? { ...w, ...updates } : w) })),
      deleteWorkflow: (id) => set((state) => ({ workflows: state.workflows.filter(w => w.id !== id) })),
      addDripCampaign: (c) => set((state) => ({ dripCampaigns: [...state.dripCampaigns, c] })),
      updateDripCampaign: (id, updates) => set((state) => ({ dripCampaigns: state.dripCampaigns.map(c => c.id === id ? { ...c, ...updates } : c) })),
      deleteDripCampaign: (id) => set((state) => ({ dripCampaigns: state.dripCampaigns.filter(c => c.id !== id) })),
      addQuote: (q) => set((state) => ({ quotes: [...state.quotes, q] })),
      updateQuote: (id, updates) => set((state) => ({ quotes: state.quotes.map(q => q.id === id ? { ...q, ...updates } : q) })),
      deleteQuote: (id) => set((state) => ({ quotes: state.quotes.filter(q => q.id !== id) })),

      convertLead: (leadId, dealOverrides) => {
        const state = get()
        const lead = state.leads.find((l) => l.id === leadId)
        if (!lead) throw new Error('Lead not found')

        const now = new Date().toISOString()
        const uid = () => Math.random().toString(36).slice(2, 10)

        // 1. Create or reuse client
        const existingClient = state.clients.find(
          (c) => c.email?.toLowerCase() === lead.email?.toLowerCase() ||
                 c.company?.toLowerCase() === lead.company?.toLowerCase()
        )

        let client: Client
        if (existingClient) {
          client = existingClient
        } else {
          const assignee = state.users.find((u) => u.id === dealOverrides.dealAssignedTo)
          client = {
            id: `client-${uid()}`,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            company: lead.company,
            industry: undefined,
            segment: undefined,
            accountOwnerId: dealOverrides.dealAssignedTo,
            accountOwnerName: assignee?.name,
            healthScore: lead.score ?? 75,
            renewalDate: undefined,
            lastContactChannel: lead.lastContactChannel,
            status: 'active',
            lifetimeValue: dealOverrides.dealValue,
            totalDeals: 1,
            tags: lead.tags ?? [],
            notes: dealOverrides.notes || lead.notes,
            lastContact: now,
            callLogs: lead.callLogs ?? [],
            messages: lead.messages ?? [],
            timeline: [
              {
                id: `tl-${uid()}`,
                type: 'system',
                title: 'Converted from lead',
                description: `Lead "${lead.name}" was qualified and converted to a client. Deal "${dealOverrides.dealName}" created.`,
                timestamp: now,
              },
              ...(lead.timeline ?? []),
            ],
            createdAt: now,
          }
          set((s) => ({ clients: [client, ...s.clients] }))
        }

        // 2. Create deal
        const deal: Deal = {
          id: `deal-${uid()}`,
          name: dealOverrides.dealName,
          clientId: client.id,
          clientName: lead.company,
          value: dealOverrides.dealValue,
          stage: dealOverrides.dealStage,
          probability: { prospecting: 20, qualification: 40, proposal: 60, negotiation: 80, 'closed-won': 100, 'closed-lost': 0 }[dealOverrides.dealStage] ?? 40,
          expectedCloseDate: dealOverrides.expectedCloseDate,
          assignedTo: dealOverrides.dealAssignedTo,
          description: dealOverrides.notes || `Converted from lead: ${lead.name}`,
          activities: [],
          createdAt: now,
          updatedAt: now,
          stageMovedAt: now,
          tags: lead.tags,
          priority: lead.priority,
        }
        set((s) => ({ deals: [deal, ...s.deals] }))

        // 3. Mark lead as converted
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === leadId
              ? { ...l, status: 'converted' as const, lastActivity: now,
                  timeline: [
                    { id: `tl-${uid()}`, type: 'system' as const,
                      title: 'Lead converted',
                      description: `Converted to client. Deal "${dealOverrides.dealName}" created (${dealOverrides.dealStage}).`,
                      timestamp: now },
                    ...(l.timeline ?? []),
                  ] }
              : l
          ),
        }))

        return { deal, client }
      },

      // CRUD operations
      addLead: (lead) => set((state) => ({
        leads: [...state.leads, lead],
        clients: mergeClientsWithConvertedLeads(state.clients, [lead]),
      })),
      updateLead: (id, updates) => set((state) => {
        const leads = state.leads.map((lead) => (lead.id === id ? { ...lead, ...updates } : lead))
        const updatedLead = leads.find((lead) => lead.id === id)

        return {
          leads,
          clients: updatedLead ? mergeClientsWithConvertedLeads(state.clients, [updatedLead]) : state.clients,
        }
      }),
      deleteLead: (id) => set((state) => ({
        leads: state.leads.filter(l => l.id !== id),
      })),
      addClient: (client) => set((state) => ({ clients: [client, ...state.clients] })),
      updateClient: (id, updates) => set((state) => ({
        clients: state.clients.map((client) => (client.id === id ? { ...client, ...updates } : client)),
      })),
      deleteClient: (id) => set((state) => ({
        clients: state.clients.filter((c) => c.id !== id),
      })),
      addTask: (task) => set((state) => ({ tasks: [...state.tasks, task] })),
      updateTask: (id, updates) => set((state) => ({
        tasks: state.tasks.map(t => t.id === id ? { ...t, ...updates } : t),
      })),
      deleteTask: (id) => set((state) => ({
        tasks: state.tasks.filter(t => t.id !== id),
      })),
      addComment: (entityType, entityId, comment) => set((state) => {
        if (entityType === 'task') {
          return { tasks: state.tasks.map(t => t.id === entityId ? { ...t, comments: [...(t.comments ?? []), comment] } : t) }
        }
        return { deals: state.deals.map(d => d.id === entityId ? { ...d, comments: [...(d.comments ?? []), comment] } : d) }
      }),
      addDeal: (deal) => set((state) => ({ deals: [...state.deals, deal] })),
      updateDeal: (id, updates) => set((state) => ({
        deals: state.deals.map(d => d.id === id ? { ...d, ...updates } : d),
      })),
      deleteDeal: (id) => set((state) => ({
        deals: state.deals.filter(d => d.id !== id),
      })),

      // Computed
      getDashboardStats: () => {
        const state = get()
        const totalRevenue = state.deals.reduce((sum, deal) => sum + deal.value, 0)
        const newLeads = state.leads.filter((lead) => lead.status === 'new').length
        const convertedLeads = state.leads.filter((lead) => lead.status === 'converted' || lead.status === 'won').length
        const conversionRate = state.leads.length ? (convertedLeads / state.leads.length) * 100 : 0

        return {
          totalRevenue,
          revenueChange: 12.5,
          activeDeals: state.deals.length,
          dealsChange: 8.3,
          newLeads,
          leadsChange: 6.2,
          conversionRate,
          conversionChange: 4.2,
        }
      },
      getPipelineData: () => {
        const leads = get().leads
        const stages = [
          { key: 'new', name: 'New', color: '#3B82F6' },
          { key: 'contacted', name: 'Contacted', color: '#6366F1' },
          { key: 'interested', name: 'Interested', color: '#F59E0B' },
          { key: 'not_interested', name: 'Not Interested', color: '#EF4444' },
          { key: 'converted', name: 'Converted', color: '#10B981' },
        ] as const

        return stages.map((stage) => {
          const matching = leads.filter((lead) => lead.status === stage.key)
          return {
            name: stage.name,
            count: matching.length,
            value: matching.reduce((sum, lead) => sum + lead.value, 0),
            color: stage.color,
          }
        })
      },
      getLeadSources: () => {
        const leads = get().leads
        const colors: Record<string, string> = {
          Manual: '#64748B',
          'Meta Ads': '#3B82F6',
          API: '#8B5CF6',
          WhatsApp: '#10B981',
          IVR: '#F59E0B',
          Website: '#06B6D4',
          Referral: '#22C55E',
          LinkedIn: '#6366F1',
          Email: '#F97316',
          Event: '#EC4899',
          Other: '#6B7280',
        }

        const labelMap: Record<string, string> = {
          manual: 'Manual',
          meta_ads: 'Meta Ads',
          api: 'API',
          whatsapp: 'WhatsApp',
          ivr: 'IVR',
          website: 'Website',
          referral: 'Referral',
          linkedin: 'LinkedIn',
          email: 'Email',
          event: 'Event',
          other: 'Other',
        }

        const grouped = leads.reduce<Record<string, number>>((acc, lead) => {
          const label = labelMap[lead.source] || 'Other'
          acc[label] = (acc[label] || 0) + 1
          return acc
        }, {})

        const total = leads.length || 1

        return Object.entries(grouped)
          .map(([source, count]) => ({
            source,
            count,
            percentage: Math.round((count / total) * 100),
            color: colors[source] || '#6B7280',
          }))
          .sort((a, b) => b.count - a.count)
      },
      getTeamPerformance: () => [
        { id: '1', name: 'Sarah Chen', deals: 28, revenue: 890000, activities: 156 },
        { id: '2', name: 'Mike Ross', deals: 24, revenue: 720000, activities: 142 },
        { id: '3', name: 'Emma Davis', deals: 21, revenue: 650000, activities: 128 },
        { id: '4', name: 'John Smith', deals: 19, revenue: 580000, activities: 115 },
        { id: '5', name: 'Lisa Wong', deals: 17, revenue: 520000, activities: 108 },
      ],
      getRevenueData: () => [
        { month: 'Jan', current: 120, previous: 95 },
        { month: 'Feb', current: 135, previous: 110 },
        { month: 'Mar', current: 180, previous: 140 },
        { month: 'Apr', current: 195, previous: 165 },
        { month: 'May', current: 220, previous: 180 },
        { month: 'Jun', current: 240, previous: 200 },
        { month: 'Jul', current: 265, previous: 215 },
        { month: 'Aug', current: 280, previous: 230 },
        { month: 'Sep', current: 295, previous: 245 },
        { month: 'Oct', current: 310, previous: 260 },
        { month: 'Nov', current: 325, previous: 275 },
        { month: 'Dec', current: 340, previous: 290 },
      ],
    }),
    {
      name: 'crm-storage',
      partialize: (state) => ({ 
        currentUser: state.currentUser, 
        isAuthenticated: state.isAuthenticated 
      }),
    }
  )
)
