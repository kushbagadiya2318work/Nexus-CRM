import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowUpDown,
  Building2,
  CalendarClock,
  Edit2,
  Eye,
  Grid3X3,
  HeartPulse,
  List,
  Mail,
  MessageCircle,
  Phone,
  Plus,
  Search,
  SendHorizonal,
  Tag,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCRMStore } from '@/store'
import { fetchClientsFromApi, logClientCallInApi, sendClientMessageInApi, updateClientInApi } from '@/lib/crm-api'
import { buildWhatsAppUrl } from '@/lib/lead-utils'
import { formatCurrency, formatDate, formatRelativeTime } from '@/lib/utils'
import type { Client } from '@/types'
import type { ChurnRiskLevel, ChurnRiskSignal } from '@/types'

// ── Churn risk ─────────────────────────────────────────────────────────────────
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function computeChurnRisk(client: Client): { level: ChurnRiskLevel; score: number; signals: ChurnRiskSignal[] } {
  const signals: ChurnRiskSignal[] = []
  let riskScore = 0

  // 1. Low / dropping health score
  const hs = client.healthScore ?? 75
  if (hs < 40) { riskScore += 35; signals.push({ label: 'Critical health score', detail: `Score is ${hs}/100`, severity: 'critical' }) }
  else if (hs < 60) { riskScore += 20; signals.push({ label: 'Low health score', detail: `Score is ${hs}/100`, severity: 'warning' }) }
  else if (hs < 75) { riskScore += 8; signals.push({ label: 'Below-average health', detail: `Score is ${hs}/100`, severity: 'info' }) }

  // 2. Days since last contact
  const daysIdle = daysSince(client.lastContact)
  if (daysIdle > 60) { riskScore += 30; signals.push({ label: 'No contact in 60+ days', detail: `Last contact ${daysIdle} days ago`, severity: 'critical' }) }
  else if (daysIdle > 30) { riskScore += 18; signals.push({ label: 'No contact in 30+ days', detail: `Last contact ${daysIdle} days ago`, severity: 'warning' }) }
  else if (daysIdle > 14) { riskScore += 7; signals.push({ label: 'No contact in 14+ days', detail: `Last contact ${daysIdle} days ago`, severity: 'info' }) }

  // 3. Renewal approaching
  if (client.renewalDate) {
    const daysToRenewal = Math.ceil((new Date(client.renewalDate).getTime() - Date.now()) / 86_400_000)
    if (daysToRenewal < 0) { riskScore += 25; signals.push({ label: 'Renewal date passed', detail: `${Math.abs(daysToRenewal)} days overdue`, severity: 'critical' }) }
    else if (daysToRenewal <= 30) { riskScore += 15; signals.push({ label: 'Renewal due soon', detail: `${daysToRenewal} days remaining`, severity: 'warning' }) }
    else if (daysToRenewal <= 60) { riskScore += 5; signals.push({ label: 'Renewal in 60 days', detail: `${daysToRenewal} days remaining`, severity: 'info' }) }
  }

  // 4. Churned status
  if (client.status === 'churned') { riskScore += 40; signals.push({ label: 'Marked as churned', detail: 'Client status is churned', severity: 'critical' }) }
  else if (client.status === 'inactive') { riskScore += 15; signals.push({ label: 'Inactive account', detail: 'Client marked inactive', severity: 'warning' }) }

  const level: ChurnRiskLevel = riskScore >= 60 ? 'critical' : riskScore >= 35 ? 'high' : riskScore >= 15 ? 'medium' : 'low'
  return { level, score: Math.min(100, riskScore), signals }
}

const CHURN_BADGE: Record<ChurnRiskLevel, string> = {
  low:      'border-emerald-500/30 text-emerald-400 bg-emerald-500/10',
  medium:   'border-amber-500/30 text-amber-400 bg-amber-500/10',
  high:     'border-rose-500/30 text-rose-400 bg-rose-500/10',
  critical: 'border-red-600/50 text-red-400 bg-red-600/15',
}

// â”€â”€ Form types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ClientFormData = {
  name: string
  email: string
  phone: string
  company: string
  industry: string
  website: string
  address: string
  segment: '' | 'startup' | 'smb' | 'enterprise' | 'vip'
  accountOwnerId: string
  healthScore: string
  renewalDate: string
  tags: string
  notes: string
  status: 'active' | 'inactive' | 'churned'
}

const blankForm = (): ClientFormData => ({
  name: '',
  email: '',
  phone: '',
  company: '',
  industry: '',
  website: '',
  address: '',
  segment: '',
  accountOwnerId: '',
  healthScore: '75',
  renewalDate: '',
  tags: '',
  notes: '',
  status: 'active',
})

const clientToForm = (client: Client): ClientFormData => ({
  name: client.name,
  email: client.email,
  phone: client.phone || '',
  company: client.company,
  industry: client.industry || '',
  website: client.website || '',
  address: client.address || '',
  segment: client.segment || '',
  accountOwnerId: client.accountOwnerId || '',
  healthScore: String(client.healthScore || 75),
  renewalDate: client.renewalDate ? client.renewalDate.substring(0, 10) : '',
  tags: (client.tags || []).join(', '),
  notes: client.notes || '',
  status: client.status,
})

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const segmentColors: Record<string, string> = {
  startup: 'border-sky-500/20 bg-sky-500/10 text-sky-400',
  smb: 'border-amber-500/20 bg-amber-500/10 text-amber-400',
  enterprise: 'border-violet-500/20 bg-violet-500/10 text-violet-400',
  vip: 'border-rose-500/20 bg-rose-500/10 text-rose-400',
}

const healthColor = (score: number) => {
  if (score >= 80) return 'text-emerald-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-rose-400'
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

export function ClientsPage() {
  const { clients, setClients, addClient, updateClient, deleteClient, users, deals, tasks } = useCRMStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [segmentFilter, setSegmentFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'company' | 'ltv' | 'health' | 'lastContact'>('company')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [detailTab, setDetailTab] = useState('overview')
  const [noteDraft, setNoteDraft] = useState('')
  const [messageDraft, setMessageDraft] = useState('Checking in from Nexus CRM. Let us know if you need anything.')
  const [statusMessage, setStatusMessage] = useState('Client communication tools are active from inside the CRM.')

  // Add/Edit form
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [formData, setFormData] = useState<ClientFormData>(blankForm())
  const [formError, setFormError] = useState('')

  // Delete confirm
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const accountOwners = useMemo(
    () => users.filter((user) => user.role === 'sales' || user.role === 'manager'),
    [users]
  )

  useEffect(() => {
    let isMounted = true
    fetchClientsFromApi().then((payload) => {
      if (isMounted && payload?.data?.length) {
        setClients(payload.data as typeof clients)
      }
    })
    return () => { isMounted = false }
  }, [setClients])

  const filteredClients = useMemo(() => {
    let result = clients.filter((client) => {
      const matchesSearch =
        client.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
        client.email.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesStatus = statusFilter === 'all' || client.status === statusFilter
      const matchesSegment = segmentFilter === 'all' || client.segment === segmentFilter
      return matchesSearch && matchesStatus && matchesSegment
    })
    result = [...result].sort((a, b) => {
      switch (sortBy) {
        case 'ltv': return b.lifetimeValue - a.lifetimeValue
        case 'health': return (b.healthScore || 75) - (a.healthScore || 75)
        case 'lastContact': return new Date(b.lastContact).getTime() - new Date(a.lastContact).getTime()
        default: return a.company.localeCompare(b.company)
      }
    })
    return result
  }, [clients, searchQuery, statusFilter, segmentFilter, sortBy])

  const selectedClient = clients.find((c) => c.id === selectedClientId) || null

  const clientDeals = useMemo(
    () => deals.filter((d) =>
      selectedClient &&
      (d.clientId === selectedClient.id ||
        d.clientName?.toLowerCase() === selectedClient.company.toLowerCase())
    ),
    [deals, selectedClient]
  )

  const clientTasks = useMemo(
    () => tasks.filter((t) =>
      selectedClient &&
      t.relatedTo?.type === 'client' &&
      t.relatedTo.id === selectedClient.id
    ),
    [tasks, selectedClient]
  )

  const renewalDueCount = clients.filter((c) =>
    c.renewalDate && new Date(c.renewalDate).getTime() <= Date.now() + 1000 * 60 * 60 * 24 * 45
  ).length

  const averageHealth = Math.round(
    clients.reduce((sum, c) => sum + (c.healthScore || 75), 0) / Math.max(1, clients.length)
  )

  // Churn risk computed for all clients
  const churnRiskClients = useMemo(
    () =>
      clients
        .map((c) => ({ client: c, ...computeChurnRisk(c) }))
        .filter((x) => x.level === 'high' || x.level === 'critical')
        .sort((a, b) => b.score - a.score),
    [clients]
  )
  const [churnBannerDismissed, setChurnBannerDismissed] = useState(false)

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const openDetails = (client: Client) => {
    setSelectedClientId(client.id)
    setDetailTab('overview')
    setNoteDraft('')
    setMessageDraft(`Hi ${client.name}, just checking in from the CRM team.`)
  }

  const openAddForm = () => {
    setFormData(blankForm())
    setFormError('')
    setFormMode('add')
  }

  const openEditForm = (client: Client) => {
    setFormData(clientToForm(client))
    setFormError('')
    setFormMode('edit')
  }

  const submitForm = () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.company.trim()) {
      setFormError('Name, email, and company are required.')
      return
    }
    const owner = accountOwners.find((u) => u.id === formData.accountOwnerId)
    const tags = formData.tags.split(',').map((t) => t.trim()).filter(Boolean)

    if (formMode === 'add') {
      const newClient: Client = {
        id: `client-${Date.now()}`,
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        company: formData.company.trim(),
        industry: formData.industry.trim() || undefined,
        website: formData.website.trim() || undefined,
        address: formData.address.trim() || undefined,
        segment: formData.segment || undefined,
        accountOwnerId: owner?.id,
        accountOwnerName: owner?.name,
        healthScore: Math.min(100, Math.max(1, Number(formData.healthScore) || 75)),
        renewalDate: formData.renewalDate ? new Date(formData.renewalDate).toISOString() : undefined,
        status: formData.status,
        lifetimeValue: 0,
        totalDeals: 0,
        tags,
        notes: formData.notes.trim() || undefined,
        lastContact: new Date().toISOString(),
        callLogs: [],
        messages: [],
        timeline: [{
          id: `timeline-create-${Date.now()}`,
          type: 'system',
          title: 'Client created',
          description: 'New client added manually from the CRM client management module.',
          timestamp: new Date().toISOString(),
        }],
        createdAt: new Date().toISOString(),
      }
      addClient(newClient)
      setStatusMessage(`${newClient.company} was added to your client list.`)
    } else if (formMode === 'edit' && selectedClientId) {
      const updates: Partial<Client> = {
        name: formData.name.trim(),
        email: formData.email.trim(),
        phone: formData.phone.trim() || undefined,
        company: formData.company.trim(),
        industry: formData.industry.trim() || undefined,
        website: formData.website.trim() || undefined,
        address: formData.address.trim() || undefined,
        segment: formData.segment || undefined,
        accountOwnerId: owner?.id,
        accountOwnerName: owner?.name,
        healthScore: Math.min(100, Math.max(1, Number(formData.healthScore) || 75)),
        renewalDate: formData.renewalDate ? new Date(formData.renewalDate).toISOString() : undefined,
        status: formData.status,
        tags,
        notes: formData.notes.trim() || undefined,
      }
      updateClient(selectedClientId, updates)
      void updateClientInApi(selectedClientId, updates)
      setStatusMessage(`${formData.company} was updated successfully.`)
    }
    setFormMode(null)
  }

  const confirmDelete = () => {
    if (!deleteTargetId) return
    const target = clients.find((c) => c.id === deleteTargetId)
    deleteClient(deleteTargetId)
    setDeleteTargetId(null)
    if (selectedClientId === deleteTargetId) setSelectedClientId(null)
    setStatusMessage(`${target?.company || 'Client'} was removed from your client list.`)
  }

  const handleClientCall = (client: Client) => {
    const now = new Date().toISOString()
    const call = {
      id: `client-call-${Date.now()}`,
      provider: 'manual' as const,
      direction: 'outbound' as const,
      status: 'answered' as const,
      duration: 0,
      timestamp: now,
      notes: 'Client call started from the CRM communication center.',
    }
    updateClient(client.id, {
      lastContact: now,
      lastContactChannel: 'call',
      callLogs: [call, ...(client.callLogs || [])],
      timeline: [
        {
          id: `client-timeline-${Date.now()}`,
          type: 'call',
          title: 'Call placed from CRM',
          description: 'The account owner initiated a call from the CRM client module.',
          timestamp: now,
        },
        ...(client.timeline || []),
      ],
    })
    void logClientCallInApi(client.id, {
      provider: 'manual',
      direction: 'outbound',
      status: 'answered',
      duration: 0,
      notes: 'Client call started from the CRM communication center.',
    })
    if (client.phone) window.open(`tel:${client.phone}`, '_self')
    setStatusMessage(`Call action started for ${client.company}. The interaction has been logged.`)
  }

  const handleClientWhatsApp = (client: Client) => {
    const now = new Date().toISOString()
    const message = {
      id: `client-message-${Date.now()}`,
      channel: 'whatsapp' as const,
      direction: 'outbound' as const,
      body: messageDraft || `Hi ${client.name}, checking in from Nexus CRM.`,
      status: 'sent' as const,
      timestamp: now,
    }
    updateClient(client.id, {
      lastContact: now,
      lastContactChannel: 'whatsapp',
      messages: [message, ...(client.messages || [])],
      timeline: [
        {
          id: `client-timeline-${Date.now()}`,
          type: 'message',
          title: 'WhatsApp sent from CRM',
          description: message.body,
          timestamp: now,
        },
        ...(client.timeline || []),
      ],
    })
    void sendClientMessageInApi(client.id, {
      channel: 'whatsapp',
      direction: 'outbound',
      body: message.body,
      status: 'sent',
    })
    window.open(buildWhatsAppUrl(client, message.body), '_blank', 'noopener,noreferrer')
    setStatusMessage(`WhatsApp message prepared for ${client.company}.`)
  }

  const handleClientEmail = (client: Client) => {
    const body = encodeURIComponent(messageDraft || `Hello ${client.name}, just checking in from the CRM team.`)
    void sendClientMessageInApi(client.id, {
      channel: 'email',
      direction: 'outbound',
      body: decodeURIComponent(body),
      status: 'sent',
    })
    window.open(`mailto:${client.email}?subject=Account%20Update&body=${body}`, '_self')
    setStatusMessage(`Email composer opened for ${client.company}.`)
  }

  const saveNote = () => {
    if (!selectedClient || !noteDraft.trim()) return
    const now = new Date().toISOString()
    updateClient(selectedClient.id, {
      notes: `${selectedClient.notes ? `${selectedClient.notes}\n` : ''}${noteDraft.trim()}`,
      lastContact: now,
      lastContactChannel: 'note',
      timeline: [
        {
          id: `client-note-${Date.now()}`,
          type: 'note',
          title: 'Client note added',
          description: noteDraft.trim(),
          timestamp: now,
        },
        ...(selectedClient.timeline || []),
      ],
    })
    void updateClientInApi(selectedClient.id, {
      notes: `${selectedClient.notes ? `${selectedClient.notes}\n` : ''}${noteDraft.trim()}`,
      lastContact: now,
      lastContactChannel: 'note',
    })
    setNoteDraft('')
    setStatusMessage(`A note was added to ${selectedClient.company}.`)
  }

  const updateOwner = (client: Client, ownerId: string) => {
    const owner = accountOwners.find((user) => user.id === ownerId)
    if (!owner) return
    updateClient(client.id, { accountOwnerId: owner.id, accountOwnerName: owner.name })
    void updateClientInApi(client.id, { accountOwnerId: owner.id, accountOwnerName: owner.name })
    setStatusMessage(`${client.company} is now managed by ${owner.name}.`)
  }

  const updateClientStatus = (client: Client, status: 'active' | 'inactive' | 'churned') => {
    updateClient(client.id, { status })
    void updateClientInApi(client.id, { status })
    setStatusMessage(`${client.company} status changed to ${status}.`)
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* Header */}
      <motion.div variants={itemVariants} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-muted">Manage renewals, account health, and all client communication from the CRM.</p>
        </div>
        <Button onClick={openAddForm}>
          <Plus className="mr-2 h-4 w-4" />
          Add Client
        </Button>
      </motion.div>

      {/* ── Churn Risk Banner ─────────────────────────────────────────────── */}
      {churnRiskClients.length > 0 && !churnBannerDismissed && (
        <motion.div variants={itemVariants} className="relative rounded-xl border border-rose-500/40 bg-rose-500/10 p-4">
          <button onClick={() => setChurnBannerDismissed(true)} className="absolute right-3 top-3 text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <HeartPulse className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-rose-400">
                AI Churn Alert — {churnRiskClients.length} client{churnRiskClients.length > 1 ? 's' : ''} at risk
              </p>
              <p className="text-xs text-muted mt-0.5 mb-3">Activity drop detected. Engage before it&apos;s too late.</p>
              <div className="space-y-2">
                {churnRiskClients.map(({ client, level, score, signals }) => (
                  <div key={client.id} className="flex flex-wrap items-start gap-2 rounded-lg border border-rose-500/20 bg-rose-500/5 p-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{client.company}</span>
                        <Badge variant="outline" className={`text-xs ${CHURN_BADGE[level]}`}>
                          {level.charAt(0).toUpperCase() + level.slice(1)} Risk · {score}
                        </Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {signals.slice(0, 3).map((s, i) => (
                          <span key={i} className={`text-xs px-1.5 py-0.5 rounded-full ${s.severity === 'critical' ? 'bg-red-600/20 text-red-300' : s.severity === 'warning' ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-500/20 text-slate-300'}`}>
                            {s.label}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => openDetails(client)} className="text-xs text-primary underline underline-offset-2 shrink-0 mt-0.5">
                      View
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{clients.length}</p>
            <p className="text-sm text-muted">Total clients</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{clients.filter((c) => c.status === 'active').length}</p>
            <p className="text-sm text-muted">Active accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{renewalDueCount}</p>
            <p className="text-sm text-muted">Renewals due soon</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{averageHealth}</p>
            <p className="text-sm text-muted">Average health score</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Status bar */}
      <motion.div variants={itemVariants}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 text-sm text-muted">{statusMessage}</CardContent>
        </Card>
      </motion.div>

      {/* Info cards */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Account management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>Assign account owners, monitor client health, and plan renewals.</p>
            <p>Converted leads become clients automatically and preserve their history.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <SendHorizonal className="h-4 w-4 text-emerald-500" />
              Communication center
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>Call, WhatsApp, and email clients directly from the CRM.</p>
            <p>Every interaction is added to the client history and timeline.</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* Filters & Controls */}
      <motion.div variants={itemVariants} className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              placeholder="Search by company, contact, or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="inactive">Inactive</TabsTrigger>
              <TabsTrigger value="churned">Churned</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* Segment filter */}
          <select
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="all">All segments</option>
            <option value="startup">Startup</option>
            <option value="smb">SMB</option>
            <option value="enterprise">Enterprise</option>
            <option value="vip">VIP</option>
          </select>
          {/* Sort */}
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-muted" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="company">Sort: Company</option>
              <option value="ltv">Sort: LTV</option>
              <option value="health">Sort: Health</option>
              <option value="lastContact">Sort: Last Contact</option>
            </select>
          </div>
          {/* View toggle */}
          <div className="ml-auto flex items-center gap-1 rounded-md border border-input bg-background p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded p-1 transition-colors ${viewMode === 'grid' ? 'bg-primary/20 text-primary' : 'text-muted hover:text-foreground'}`}
              title="Grid view"
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded p-1 transition-colors ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'text-muted hover:text-foreground'}`}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Empty state */}
      {filteredClients.length === 0 ? (
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-10 text-center text-muted">
              <Users className="mx-auto mb-3 h-10 w-10 opacity-30" />
              <p className="font-medium">No clients found</p>
              <p className="mt-1 text-sm">Try adjusting your search or filters, or add a new client.</p>
            </CardContent>
          </Card>
        </motion.div>
      ) : viewMode === 'grid' ? (
        /* Grid view */
        <motion.div variants={itemVariants} className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredClients.map((client) => (
            <Card key={client.id} className="transition-shadow hover:shadow-elevated">
              <CardContent className="space-y-4 p-5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{client.company}</h3>
                      <p className="text-sm text-muted">{client.name}</p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      client.status === 'active'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                        : client.status === 'churned'
                        ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                        : 'border-slate-500/20 bg-slate-500/10 text-slate-400'
                    }
                  >
                    {client.status}
                  </Badge>
                </div>

                {/* Contact info */}
                <div className="space-y-1.5 text-sm text-muted">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 shrink-0" />
                    <span className="truncate">{client.email}</span>
                  </div>
                  {client.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 shrink-0" />
                      <span>{client.phone}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 shrink-0" />
                    <span>{client.accountOwnerName || 'Unassigned'}</span>
                  </div>
                  {client.industry && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 shrink-0" />
                      <span>{client.industry}</span>
                    </div>
                  )}
                </div>

                {/* Segment & tags */}
                {(client.segment || (client.tags || []).length > 0) && (
                  <div className="flex flex-wrap gap-1">
                    {client.segment && (
                      <Badge variant="outline" className={segmentColors[client.segment] || ''}>
                        {client.segment}
                      </Badge>
                    )}
                    {(client.tags || []).slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="outline" className="border-border text-muted text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Churn risk badge */}
                {(() => {
                  const cr = computeChurnRisk(client)
                  if (cr.level === 'low') return null
                  return (
                    <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${cr.level === 'critical' ? 'bg-red-600/15 text-red-300' : cr.level === 'high' ? 'bg-rose-500/15 text-rose-300' : 'bg-amber-500/15 text-amber-300'}`}>
                      <HeartPulse className="h-3.5 w-3.5 shrink-0" />
                      <span className="font-medium">{cr.level === 'critical' ? 'Critical' : 'High'} Churn Risk</span>
                      <span className="text-muted">·</span>
                      <span>{cr.signals[0]?.label}</span>
                    </div>
                  )
                })()}

                {/* Metrics */}
                <div className="space-y-2 rounded-xl border border-border p-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted">LTV</p>
                      <p className="font-semibold">{formatCurrency(client.lifetimeValue)}</p>
                    </div>
                    <div>
                      <p className="text-muted">Renewal</p>
                      <p className="font-semibold">{client.renewalDate ? formatDate(client.renewalDate) : 'TBD'}</p>
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-muted">
                      <span>Health</span>
                      <span className={`font-semibold ${healthColor(client.healthScore || 75)}`}>
                        {client.healthScore || 75}/100
                      </span>
                    </div>
                    <Progress value={client.healthScore || 75} className="h-1.5" />
                  </div>
                  <div>
                    <p className="text-muted">Last touch</p>
                    <p className="font-semibold">{formatRelativeTime(client.lastContact)}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => handleClientCall(client)} title="Call client">
                      <Phone className="h-4 w-4 text-primary" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleClientWhatsApp(client)} title="WhatsApp">
                      <MessageCircle className="h-4 w-4 text-emerald-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleClientEmail(client)} title="Email">
                      <Mail className="h-4 w-4 text-amber-500" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => { setSelectedClientId(client.id); openEditForm(client) }} title="Edit client">
                      <Edit2 className="h-4 w-4 text-muted" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openDetails(client)} title="View details">
                      <Eye className="h-4 w-4 text-violet-500" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteTargetId(client.id)} title="Delete client">
                      <Trash2 className="h-4 w-4 text-rose-500" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      ) : (
        /* List view */
        <motion.div variants={itemVariants} className="space-y-2">
          {filteredClients.map((client) => (
            <Card key={client.id} className="transition-shadow hover:shadow-elevated">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{client.company}</span>
                    <span className="text-sm text-muted">â€” {client.name}</span>
                    <Badge
                      variant="outline"
                      className={
                        client.status === 'active'
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
                          : client.status === 'churned'
                          ? 'border-rose-500/20 bg-rose-500/10 text-rose-400'
                          : 'border-slate-500/20 bg-slate-500/10 text-slate-400'
                      }
                    >
                      {client.status}
                    </Badge>
                    {client.segment && (
                      <Badge variant="outline" className={segmentColors[client.segment] || ''}>
                        {client.segment}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted">
                    <span>{client.email}</span>
                    {client.phone && <span>{client.phone}</span>}
                    <span>LTV: {formatCurrency(client.lifetimeValue)}</span>
                    <span className={healthColor(client.healthScore || 75)}>
                      Health: {client.healthScore || 75}
                    </span>
                    <span>Last: {formatRelativeTime(client.lastContact)}</span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => handleClientCall(client)} title="Call">
                    <Phone className="h-4 w-4 text-primary" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleClientWhatsApp(client)} title="WhatsApp">
                    <MessageCircle className="h-4 w-4 text-emerald-500" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => handleClientEmail(client)} title="Email">
                    <Mail className="h-4 w-4 text-amber-500" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => { setSelectedClientId(client.id); openEditForm(client) }} title="Edit">
                    <Edit2 className="h-4 w-4 text-muted" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openDetails(client)} title="Details">
                    <Eye className="h-4 w-4 text-violet-500" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteTargetId(client.id)} title="Delete">
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      )}

      {/* â”€â”€â”€ Client Detail Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog open={Boolean(selectedClient)} onOpenChange={(open) => !open && setSelectedClientId(null)}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          {selectedClient && (
            <>
              <DialogHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <DialogTitle>{selectedClient.company}</DialogTitle>
                    <DialogDescription>
                      Manage account ownership, renewal readiness, and client communication.
                    </DialogDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSelectedClientId(null); openEditForm(selectedClient) }}
                  >
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Edit
                  </Button>
                </div>
              </DialogHeader>

              <Tabs value={detailTab} onValueChange={setDetailTab} className="mt-2">
                <TabsList className="w-full">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="deals">Deals ({clientDeals.length})</TabsTrigger>
                  <TabsTrigger value="tasks">Tasks ({clientTasks.length})</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                  <TabsTrigger value="comms">Communication</TabsTrigger>
                </TabsList>

                {/* â”€â”€ Overview â”€â”€ */}
                <TabsContent value="overview">
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle className="text-sm">Contact info</CardTitle></CardHeader>
                      <CardContent className="grid grid-cols-2 gap-3 text-sm">
                        {([
                          ['Contact', selectedClient.name],
                          ['Email', selectedClient.email],
                          ['Phone', selectedClient.phone || 'â€”'],
                          ['Segment', selectedClient.segment || 'General'],
                          ['Industry', selectedClient.industry || 'â€”'],
                          ['Website', selectedClient.website || 'â€”'],
                          ['Address', selectedClient.address || 'â€”'],
                          ['Owner', selectedClient.accountOwnerName || 'Unassigned'],
                        ] as [string, string][]).map(([label, value]) => (
                          <div key={label}>
                            <p className="text-muted">{label}</p>
                            <p className="truncate font-medium">{value}</p>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader><CardTitle className="text-sm">Account health</CardTitle></CardHeader>
                      <CardContent className="space-y-4 text-sm">
                        <div>
                          <div className="mb-1 flex justify-between">
                            <span className="text-muted">Health score</span>
                            <span className={`font-semibold ${healthColor(selectedClient.healthScore || 75)}`}>
                              {selectedClient.healthScore || 75}/100
                            </span>
                          </div>
                          <Progress value={selectedClient.healthScore || 75} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-muted">LTV</p>
                            <p className="font-semibold">{formatCurrency(selectedClient.lifetimeValue)}</p>
                          </div>
                          <div>
                            <p className="text-muted">Total deals</p>
                            <p className="font-semibold">{selectedClient.totalDeals}</p>
                          </div>
                          <div>
                            <p className="text-muted">Renewal</p>
                            <p className="font-semibold">
                              {selectedClient.renewalDate ? formatDate(selectedClient.renewalDate) : 'TBD'}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted">Last contact</p>
                            <p className="font-semibold">{formatRelativeTime(selectedClient.lastContact)}</p>
                          </div>
                        </div>
                        {(selectedClient.tags || []).length > 0 && (
                          <div>
                            <p className="mb-1 flex items-center gap-1 text-muted">
                              <Tag className="h-3.5 w-3.5" /> Tags
                            </p>
                            <div className="flex flex-wrap gap-1">
                              {selectedClient.tags.map((tag) => (
                                <Badge key={tag} variant="outline" className="border-border text-xs text-muted">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {selectedClient.notes && (
                          <div>
                            <p className="text-muted">Notes</p>
                            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
                              {selectedClient.notes}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Account controls */}
                    <Card className="md:col-span-2">
                      <CardHeader><CardTitle className="text-sm">Account controls</CardTitle></CardHeader>
                      <CardContent className="flex flex-wrap gap-4">
                        <div className="min-w-[180px] space-y-1">
                          <label className="text-sm font-medium">Account owner</label>
                          <select
                            value={selectedClient.accountOwnerId || ''}
                            onChange={(e) => updateOwner(selectedClient, e.target.value)}
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="">â€” Unassigned â€”</option>
                            {accountOwners.map((owner) => (
                              <option key={owner.id} value={owner.id}>{owner.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="min-w-[180px] space-y-1">
                          <label className="text-sm font-medium">Account status</label>
                          <select
                            value={selectedClient.status}
                            onChange={(e) =>
                              updateClientStatus(selectedClient, e.target.value as 'active' | 'inactive' | 'churned')
                            }
                            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                            <option value="churned">Churned</option>
                          </select>
                        </div>
                        <div className="flex items-end gap-3 text-sm text-muted">
                          <div className="flex items-center gap-1.5">
                            <HeartPulse className="h-4 w-4 text-emerald-500" />
                            Health: {selectedClient.healthScore || 75}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <CalendarClock className="h-4 w-4 text-primary" />
                            Renewal: {selectedClient.renewalDate ? formatDate(selectedClient.renewalDate) : 'Not scheduled'}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* â”€â”€ Deals â”€â”€ */}
                <TabsContent value="deals">
                  <div className="mt-4 space-y-3">
                    {clientDeals.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted">
                        No deals linked to this client.
                      </div>
                    ) : clientDeals.map((deal) => (
                      <Card key={deal.id}>
                        <CardContent className="p-4 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold">{deal.name}</p>
                              <p className="text-muted capitalize">{deal.stage.replace('-', ' ')} Â· {deal.probability}% probability</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold">{formatCurrency(deal.value)}</p>
                              <p className="text-muted">Close: {formatDate(deal.expectedCloseDate)}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {/* â”€â”€ Tasks â”€â”€ */}
                <TabsContent value="tasks">
                  <div className="mt-4 space-y-3">
                    {clientTasks.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted">
                        No tasks linked to this client.
                      </div>
                    ) : clientTasks.map((task) => (
                      <Card key={task.id}>
                        <CardContent className="flex items-center gap-4 p-4 text-sm">
                          <div className="flex-1">
                            <p className="font-semibold">{task.title}</p>
                            {task.description && <p className="text-muted">{task.description}</p>}
                          </div>
                          <div className="shrink-0 text-right">
                            <Badge
                              variant="outline"
                              className={
                                task.priority === 'high'
                                  ? 'border-rose-500/20 text-rose-400'
                                  : task.priority === 'medium'
                                  ? 'border-amber-500/20 text-amber-400'
                                  : 'border-border text-muted'
                              }
                            >
                              {task.priority}
                            </Badge>
                            <p className="mt-1 text-muted">Due: {formatDate(task.dueDate)}</p>
                            <p className="text-muted capitalize">{task.status}</p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </TabsContent>

                {/* â”€â”€ Timeline â”€â”€ */}
                <TabsContent value="timeline">
                  <div className="mt-4 space-y-3">
                    {(selectedClient.timeline || []).length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted">No timeline events yet.</div>
                    ) : (selectedClient.timeline || []).map((item) => (
                      <div key={item.id} className="rounded-xl border border-border p-3 text-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{item.title}</p>
                            <p className="text-muted">{item.description}</p>
                          </div>
                          <span className="shrink-0 text-xs text-muted">{formatRelativeTime(item.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                {/* â”€â”€ Communication â”€â”€ */}
                <TabsContent value="comms">
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle className="text-sm">Send message</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <textarea
                          value={messageDraft}
                          onChange={(e) => setMessageDraft(e.target.value)}
                          rows={4}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                        <div className="grid grid-cols-3 gap-2">
                          <Button variant="outline" onClick={() => handleClientCall(selectedClient)}>
                            <Phone className="mr-1 h-3.5 w-3.5" /> Call
                          </Button>
                          <Button variant="outline" onClick={() => handleClientWhatsApp(selectedClient)}>
                            <MessageCircle className="mr-1 h-3.5 w-3.5" /> WhatsApp
                          </Button>
                          <Button variant="outline" onClick={() => handleClientEmail(selectedClient)}>
                            <Mail className="mr-1 h-3.5 w-3.5" /> Email
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle className="text-sm">Internal notes</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        <textarea
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          rows={4}
                          placeholder="Write account notes, renewal context, or next steps"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                        />
                        <Button onClick={saveNote} className="w-full">Save note</Button>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* â”€â”€â”€ Add / Edit Client Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog open={formMode !== null} onOpenChange={(open) => !open && setFormMode(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode === 'add' ? 'Add new client' : 'Edit client'}</DialogTitle>
            <DialogDescription>
              {formMode === 'add'
                ? 'Fill in the details to add a new client to your CRM.'
                : 'Update the client details below.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Contact name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))}
                placeholder="Full name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Email *</label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@company.com"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Company *</label>
              <Input
                value={formData.company}
                onChange={(e) => setFormData((f) => ({ ...f, company: e.target.value }))}
                placeholder="Company name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+1-555-0000"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Industry</label>
              <Input
                value={formData.industry}
                onChange={(e) => setFormData((f) => ({ ...f, industry: e.target.value }))}
                placeholder="Technology, Financeâ€¦"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Website</label>
              <Input
                value={formData.website}
                onChange={(e) => setFormData((f) => ({ ...f, website: e.target.value }))}
                placeholder="https://company.com"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Address</label>
              <Input
                value={formData.address}
                onChange={(e) => setFormData((f) => ({ ...f, address: e.target.value }))}
                placeholder="Street, City, Country"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Segment</label>
              <select
                value={formData.segment}
                onChange={(e) => setFormData((f) => ({ ...f, segment: e.target.value as ClientFormData['segment'] }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select segment</option>
                <option value="startup">Startup</option>
                <option value="smb">SMB</option>
                <option value="enterprise">Enterprise</option>
                <option value="vip">VIP</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value as ClientFormData['status'] }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="churned">Churned</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Account owner</label>
              <select
                value={formData.accountOwnerId}
                onChange={(e) => setFormData((f) => ({ ...f, accountOwnerId: e.target.value }))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">â€” Unassigned â€”</option>
                {accountOwners.map((owner) => (
                  <option key={owner.id} value={owner.id}>{owner.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Health score (1â€“100)</label>
              <Input
                type="number"
                min={1}
                max={100}
                value={formData.healthScore}
                onChange={(e) => setFormData((f) => ({ ...f, healthScore: e.target.value }))}
                placeholder="75"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Renewal date</label>
              <Input
                type="date"
                value={formData.renewalDate}
                onChange={(e) => setFormData((f) => ({ ...f, renewalDate: e.target.value }))}
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Tags (comma-separated)</label>
              <Input
                value={formData.tags}
                onChange={(e) => setFormData((f) => ({ ...f, tags: e.target.value }))}
                placeholder="enterprise, vip, annual"
              />
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData((f) => ({ ...f, notes: e.target.value }))}
                rows={3}
                placeholder="Account notes, context, next steps"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {formError && (
            <p className="rounded-md bg-error/10 p-2 text-sm text-error">{formError}</p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormMode(null)}>Cancel</Button>
            <Button onClick={submitForm}>{formMode === 'add' ? 'Add client' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* â”€â”€â”€ Delete Confirm Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Dialog open={Boolean(deleteTargetId)} onOpenChange={(open) => !open && setDeleteTargetId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete client?</DialogTitle>
            <DialogDescription>
              {(() => {
                const c = clients.find((x) => x.id === deleteTargetId)
                return `This will permanently remove ${c?.company || 'this client'} from your CRM. This action cannot be undone.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTargetId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  )
}
