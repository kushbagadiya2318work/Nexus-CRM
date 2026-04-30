import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User, Lead, Client, Deal, Task, Activity, Invoice, DashboardStats, AIInsight, ChatMessage, Workflow, DripCampaign, Comment, Quote } from '@/types'
import {
  createClientInApi,
  createDealInApi,
  createTaskInApi,
  deleteClientInApi,
  deleteDealInApi,
  deleteTaskInApi,
  fetchClientsFromApi,
  fetchDealsFromApi,
  fetchLeadModuleState,
  fetchTasksFromApi,
  fetchUsersFromApi,
  loginToApi,
  logoutFromApi,
  updateClientInApi,
  updateDealInApi,
  updateLeadInApi,
  updateTaskInApi,
} from '@/lib/crm-api'

interface CRMState {
  currentUser: User | null
  isAuthenticated: boolean
  isHydrating: boolean
  setCurrentUser: (user: User | null) => void
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  hydrateCRMData: () => Promise<void>

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

  convertLead: (leadId: string, dealOverrides: {
    dealName: string
    dealValue: number
    dealStage: Deal['stage']
    dealAssignedTo: string
    expectedCloseDate: string
    notes?: string
  }) => { deal: Deal; client: Client }

  getDashboardStats: () => DashboardStats
  getPipelineData: () => { name: string; count: number; value: number; color: string }[]
  getLeadSources: () => { source: string; count: number; percentage: number; color: string }[]
  getTeamPerformance: () => { id: string; name: string; deals: number; revenue: number; activities: number }[]
  getRevenueData: () => { month: string; current: number; previous: number }[]
}

const emptyCollections = {
  users: [] as User[],
  leads: [] as Lead[],
  clients: [] as Client[],
  deals: [] as Deal[],
  tasks: [] as Task[],
  activities: [] as Activity[],
  invoices: [] as Invoice[],
  aiInsights: [] as AIInsight[],
  workflows: [] as Workflow[],
  dripCampaigns: [] as DripCampaign[],
  quotes: [] as Quote[],
}

const initialChat: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: "Hi. I'm your CRM assistant. Once live data is connected, I can help inspect leads, tasks, deals, and follow-ups.",
    timestamp: new Date().toISOString(),
  },
]

const toList = <T>(payload: { data?: unknown[] } | null): T[] => Array.isArray(payload?.data) ? payload.data as T[] : []
const apiRecord = <T>(payload: unknown): T | null => {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return null
}
const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function createClientFromLead(lead: Lead, owner?: User): Client {
  const now = new Date().toISOString()
  return {
    id: uid('client'),
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    status: 'active',
    segment: lead.value > 100000 ? 'enterprise' : lead.value > 50000 ? 'smb' : 'startup',
    accountOwnerId: owner?.id || lead.assignedTo,
    accountOwnerName: owner?.name || lead.assignedUserName,
    healthScore: Math.min(100, Math.max(65, lead.score || 75)),
    lifetimeValue: lead.value || 0,
    totalDeals: 1,
    tags: Array.from(new Set([...(lead.tags || []), 'converted'])),
    notes: lead.notes,
    lastContact: lead.lastContacted || lead.lastActivity || now,
    lastContactChannel: lead.lastContactChannel,
    callLogs: lead.callLogs || [],
    messages: lead.messages || [],
    timeline: lead.timeline || [],
    createdAt: now,
  }
}

function replaceById<T extends { id: string }>(items: T[], id: string, next: T) {
  return items.map((item) => item.id === id ? next : item)
}

export const useCRMStore = create<CRMState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      isAuthenticated: false,
      isHydrating: false,
      ...emptyCollections,
      chatMessages: initialChat,

      setCurrentUser: (user) => set({ currentUser: user, isAuthenticated: !!user }),
      login: async (email, password) => {
        const payload = await loginToApi(email, password)
        if (!payload?.user) return false

        set({ currentUser: payload.user as User, isAuthenticated: true })
        await get().hydrateCRMData()
        return true
      },
      logout: () => {
        void logoutFromApi()
        set({ currentUser: null, isAuthenticated: false, ...emptyCollections })
      },
      hydrateCRMData: async () => {
        set({ isHydrating: true })
        try {
          const [users, leads, clients, deals, tasks] = await Promise.all([
            fetchUsersFromApi(),
            fetchLeadModuleState(),
            fetchClientsFromApi(),
            fetchDealsFromApi(),
            fetchTasksFromApi(),
          ])

          set({
            users: toList<User>(users),
            leads: toList<Lead>(leads),
            clients: toList<Client>(clients),
            deals: toList<Deal>(deals),
            tasks: toList<Task>(tasks),
          })
        } finally {
          set({ isHydrating: false })
        }
      },

      setUsers: (users) => set({ users }),
      setLeads: (leads) => set({ leads }),
      setClients: (clients) => set({ clients }),
      setDeals: (deals) => set({ deals }),
      setTasks: (tasks) => set({ tasks }),
      setActivities: (activities) => set({ activities }),
      setInvoices: (invoices) => set({ invoices }),
      setAIInsights: (insights) => set({ aiInsights: insights }),
      addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
      clearChat: () => set({ chatMessages: [] }),
      addWorkflow: (workflow) => set((state) => ({ workflows: [...state.workflows, workflow] })),
      updateWorkflow: (id, updates) => set((state) => ({ workflows: state.workflows.map((workflow) => workflow.id === id ? { ...workflow, ...updates } : workflow) })),
      deleteWorkflow: (id) => set((state) => ({ workflows: state.workflows.filter((workflow) => workflow.id !== id) })),
      addDripCampaign: (campaign) => set((state) => ({ dripCampaigns: [...state.dripCampaigns, campaign] })),
      updateDripCampaign: (id, updates) => set((state) => ({ dripCampaigns: state.dripCampaigns.map((campaign) => campaign.id === id ? { ...campaign, ...updates } : campaign) })),
      deleteDripCampaign: (id) => set((state) => ({ dripCampaigns: state.dripCampaigns.filter((campaign) => campaign.id !== id) })),
      addQuote: (quote) => set((state) => ({ quotes: [...state.quotes, quote] })),
      updateQuote: (id, updates) => set((state) => ({ quotes: state.quotes.map((quote) => quote.id === id ? { ...quote, ...updates } : quote) })),
      deleteQuote: (id) => set((state) => ({ quotes: state.quotes.filter((quote) => quote.id !== id) })),

      addLead: (lead) => set((state) => ({ leads: [lead, ...state.leads] })),
      updateLead: (id, updates) => {
        set((state) => ({ leads: state.leads.map((lead) => lead.id === id ? { ...lead, ...updates } : lead) }))
        void updateLeadInApi(id, updates as Record<string, unknown>)
      },
      deleteLead: (id) => set((state) => ({ leads: state.leads.filter((lead) => lead.id !== id) })),

      addClient: (client) => {
        set((state) => ({ clients: [client, ...state.clients] }))
        void createClientInApi(client as unknown as Record<string, unknown>).then((payload) => {
          const saved = apiRecord<Client>(payload)
          if (saved) set((state) => ({ clients: replaceById(state.clients, client.id, saved) }))
        })
      },
      updateClient: (id, updates) => {
        set((state) => ({ clients: state.clients.map((client) => client.id === id ? { ...client, ...updates } : client) }))
        void updateClientInApi(id, updates as Record<string, unknown>)
      },
      deleteClient: (id) => {
        set((state) => ({ clients: state.clients.filter((client) => client.id !== id) }))
        void deleteClientInApi(id)
      },

      addTask: (task) => {
        set((state) => ({ tasks: [task, ...state.tasks] }))
        void createTaskInApi(task as unknown as Record<string, unknown>).then((payload) => {
          const saved = apiRecord<Task>(payload)
          if (saved) set((state) => ({ tasks: replaceById(state.tasks, task.id, saved) }))
        })
      },
      updateTask: (id, updates) => {
        set((state) => ({ tasks: state.tasks.map((task) => task.id === id ? { ...task, ...updates } : task) }))
        void updateTaskInApi(id, updates as Record<string, unknown>)
      },
      deleteTask: (id) => {
        set((state) => ({ tasks: state.tasks.filter((task) => task.id !== id) }))
        void deleteTaskInApi(id)
      },

      addComment: (entityType, entityId, comment) => {
        if (entityType === 'task') {
          get().updateTask(entityId, {
            comments: [...(get().tasks.find((task) => task.id === entityId)?.comments ?? []), comment],
          })
          return
        }
        get().updateDeal(entityId, {
          comments: [...(get().deals.find((deal) => deal.id === entityId)?.comments ?? []), comment],
        })
      },
      addDeal: (deal) => {
        set((state) => ({ deals: [deal, ...state.deals] }))
        void createDealInApi(deal as unknown as Record<string, unknown>).then((payload) => {
          const saved = apiRecord<Deal>(payload)
          if (saved) set((state) => ({ deals: replaceById(state.deals, deal.id, saved) }))
        })
      },
      updateDeal: (id, updates) => {
        set((state) => ({ deals: state.deals.map((deal) => deal.id === id ? { ...deal, ...updates } : deal) }))
        void updateDealInApi(id, updates as Record<string, unknown>)
      },
      deleteDeal: (id) => {
        set((state) => ({ deals: state.deals.filter((deal) => deal.id !== id) }))
        void deleteDealInApi(id)
      },

      convertLead: (leadId, dealOverrides) => {
        const state = get()
        const lead = state.leads.find((item) => item.id === leadId)
        if (!lead) throw new Error('Lead not found')

        const now = new Date().toISOString()
        const owner = state.users.find((user) => user.id === dealOverrides.dealAssignedTo)
        const client = state.clients.find((item) =>
          item.email?.toLowerCase() === lead.email?.toLowerCase() ||
          item.company?.toLowerCase() === lead.company?.toLowerCase()
        ) || createClientFromLead(lead, owner)
        const deal: Deal = {
          id: uid('deal'),
          name: dealOverrides.dealName,
          clientId: client.id,
          clientName: client.company || lead.company,
          value: dealOverrides.dealValue,
          stage: dealOverrides.dealStage,
          probability: { prospecting: 20, qualification: 40, proposal: 60, negotiation: 80, 'closed-won': 100, 'closed-lost': 0 }[dealOverrides.dealStage],
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

        if (!state.clients.some((item) => item.id === client.id)) get().addClient(client)
        get().addDeal(deal)
        get().updateLead(leadId, { status: 'converted', lastActivity: now })
        return { deal, client }
      },

      getDashboardStats: () => {
        const state = get()
        const totalRevenue = state.deals.filter((deal) => deal.stage === 'closed-won').reduce((sum, deal) => sum + deal.value, 0)
        const newLeads = state.leads.filter((lead) => lead.status === 'new').length
        const convertedLeads = state.leads.filter((lead) => ['converted', 'won'].includes(lead.status)).length
        const conversionRate = state.leads.length ? (convertedLeads / state.leads.length) * 100 : 0

        return {
          totalRevenue,
          revenueChange: 0,
          activeDeals: state.deals.filter((deal) => !['closed-won', 'closed-lost'].includes(deal.stage)).length,
          dealsChange: 0,
          newLeads,
          leadsChange: 0,
          conversionRate,
          conversionChange: 0,
        }
      },
      getPipelineData: () => {
        const stages = [
          { key: 'prospecting', name: 'Prospecting', color: '#3B82F6' },
          { key: 'qualification', name: 'Qualification', color: '#06B6D4' },
          { key: 'proposal', name: 'Proposal', color: '#8B5CF6' },
          { key: 'negotiation', name: 'Negotiation', color: '#F59E0B' },
          { key: 'closed-won', name: 'Closed Won', color: '#10B981' },
        ] as const

        return stages.map((stage) => {
          const matching = get().deals.filter((deal) => deal.stage === stage.key)
          return {
            name: stage.name,
            count: matching.length,
            value: matching.reduce((sum, deal) => sum + deal.value, 0),
            color: stage.color,
          }
        })
      },
      getLeadSources: () => {
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
        const colors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4', '#EC4899', '#64748B']
        const grouped = get().leads.reduce<Record<string, number>>((acc, lead) => {
          const label = labelMap[lead.source] || 'Other'
          acc[label] = (acc[label] || 0) + 1
          return acc
        }, {})
        const total = get().leads.length || 1
        return Object.entries(grouped).map(([source, count], index) => ({
          source,
          count,
          percentage: Math.round((count / total) * 100),
          color: colors[index % colors.length],
        }))
      },
      getTeamPerformance: () => get().users.map((user) => {
        const userDeals = get().deals.filter((deal) => deal.assignedTo === user.id)
        return {
          id: user.id,
          name: user.name,
          deals: userDeals.length,
          revenue: userDeals.filter((deal) => deal.stage === 'closed-won').reduce((sum, deal) => sum + deal.value, 0),
          activities: get().tasks.filter((task) => task.assignedTo === user.id).length,
        }
      }),
      getRevenueData: () => {
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        return monthNames.map((month, index) => ({
          month,
          current: get().deals
            .filter((deal) => deal.stage === 'closed-won' && new Date(deal.actualCloseDate || deal.updatedAt).getMonth() === index)
            .reduce((sum, deal) => sum + deal.value, 0),
          previous: 0,
        }))
      },
    }),
    {
      name: 'crm-storage',
      partialize: (state) => ({
        currentUser: state.currentUser,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
