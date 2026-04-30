import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Bot,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Eye,
  Filter,
  Map,
  MessageCircle,
  Pencil,
  Phone,
  PhoneMissed,
  Plus,
  Save,
  Search,
  Table2,
  Webhook,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCRMStore } from '@/store'
import { createLeadInApi, fetchLeadModuleState, logLeadCallInApi, sendLeadMessageInApi, updateLeadInApi } from '@/lib/crm-api'
import { buildWhatsAppUrl, getAssignedUserName, leadSourceOptions, leadStatusOptions, sourceLabels, sourceStyles, statusLabels, statusStyles } from '@/lib/lead-utils'
import { formatCurrency, formatDate, formatRelativeTime, getInitials } from '@/lib/utils'
import { ConvertLeadDialog } from './ConvertLeadDialog'
import { LeadMapView } from './LeadMapView'
import type { Lead, LeadSource, LeadStatus } from '@/types'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.04 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

const pageSize = 5
type LeadPriority = 'low' | 'medium' | 'high'

const priorityOptions: LeadPriority[] = ['low', 'medium', 'high']

const priorityStyles: Record<LeadPriority, string> = {
  low: 'bg-slate-500/10 text-slate-600 border-slate-500/20',
  medium: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  high: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
}

interface LeadFormState {
  name: string
  email: string
  phone: string
  company: string
  source: LeadSource
  notes: string
  assignedTo: string
  priority: LeadPriority
  nextFollowUp: string
  department: string
  requiredSkill: string
  tags: string
}

const defaultFormState: LeadFormState = {
  name: '',
  email: '',
  phone: '',
  company: '',
  source: 'manual',
  notes: '',
  assignedTo: '',
  priority: 'medium',
  nextFollowUp: '',
  department: '',
  requiredSkill: '',
  tags: '',
}

export function LeadsPage() {
  const { leads, users, addLead, updateLead, setLeads } = useCRMStore()
  const salesUsers = useMemo(
    () => users.filter((user) => user.role === 'sales' || user.role === 'manager'),
    [users]
  )

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | LeadStatus>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | LeadSource>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | LeadPriority>('all')
  const [assignedFilter, setAssignedFilter] = useState<'all' | string>('all')
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all')
  const [page, setPage] = useState(1)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogMode, setDialogMode] = useState<'create' | 'edit'>('create')
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null)
  const [formState, setFormState] = useState<LeadFormState>(defaultFormState)
  const [activityMessage, setActivityMessage] = useState(
    'Round-robin assignment, WhatsApp welcome messages, and follow-up reminders are active.'
  )

  // Lead conversion
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null)
  const [leadDeskView, setLeadDeskView] = useState<'table' | 'map'>('table')
  const [urgentOnly, setUrgentOnly] = useState(false)

  useEffect(() => {
    setPage(1)
  }, [searchQuery, statusFilter, sourceFilter, priorityFilter, assignedFilter, dateFilter, urgentOnly])

  useEffect(() => {
    let isMounted = true

    fetchLeadModuleState().then((payload) => {
      if (isMounted && payload?.data?.length) {
        setLeads(payload.data as Lead[])
        setActivityMessage('Live API sync connected. Leads are now updating against the backend service.')
      }
    })

    return () => {
      isMounted = false
    }
  }, [setLeads])

  const filteredLeads = useMemo(() => {
    return leads
      .filter((lead) => {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          lead.name.toLowerCase().includes(query) ||
          lead.company.toLowerCase().includes(query) ||
          lead.email.toLowerCase().includes(query) ||
          (lead.phone || '').toLowerCase().includes(query)

        const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
        const matchesSource = sourceFilter === 'all' || lead.source === sourceFilter
        const matchesPriority = priorityFilter === 'all' || (lead.priority || 'medium') === priorityFilter
        const matchesAssigned =
          assignedFilter === 'all' ||
          getAssignedUserName(lead, users).toLowerCase() === assignedFilter.toLowerCase()

        const created = new Date(lead.createdAt).getTime()
        const now = Date.now()
        const matchesDate =
          dateFilter === 'all' ||
          (dateFilter === 'today' && now - created <= 1000 * 60 * 60 * 24) ||
          (dateFilter === 'week' && now - created <= 1000 * 60 * 60 * 24 * 7) ||
          (dateFilter === 'month' && now - created <= 1000 * 60 * 60 * 24 * 30)

        const isOverdue = lead.nextFollowUp
          ? new Date(lead.nextFollowUp).getTime() < Date.now()
          : false
        const isHighIntent = (lead.score ?? 0) >= 85
        const matchesUrgent = !urgentOnly || isOverdue || isHighIntent

        return matchesSearch && matchesStatus && matchesSource && matchesPriority && matchesAssigned && matchesDate && matchesUrgent
      })
      .sort((a, b) => {
        // Always surface overdue high-priority first
        const aUrgent = (a.nextFollowUp && new Date(a.nextFollowUp).getTime() < Date.now()) ? 1 : 0
        const bUrgent = (b.nextFollowUp && new Date(b.nextFollowUp).getTime() < Date.now()) ? 1 : 0
        if (bUrgent !== aUrgent) return bUrgent - aUrgent
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      })
  }, [assignedFilter, dateFilter, leads, priorityFilter, searchQuery, sourceFilter, statusFilter, urgentOnly, users])

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize))
  const paginatedLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize)

  const missedCallCount = leads.reduce(
    (total, lead) => total + (lead.callLogs?.filter((log) => log.status === 'missed').length || 0),
    0
  )
  const highPriorityCount = leads.filter((lead) => (lead.priority || 'medium') === 'high').length
  const interestedCount = leads.filter((lead) => lead.status === 'interested').length
  const dueTodayCount = leads.filter((lead) => {
    if (!lead.nextFollowUp) {
      return false
    }

    return new Date(lead.nextFollowUp).getTime() <= Date.now() + 1000 * 60 * 60 * 24
  }).length
  const unattendedCount = leads.filter((lead) => {
    if (!lead.lastContacted) {
      return true
    }

    return Date.now() - new Date(lead.lastContacted).getTime() > 1000 * 60 * 60 * 48
  }).length

  const getUserLoad = (userId: string) => leads.filter((lead) => {
    return lead.assignedTo === userId && !['converted', 'won', 'lost', 'not_interested'].includes(lead.status)
  }).length

  const selectLocalAssignee = (staffId?: string, requiredSkill?: string, department?: string) => {
    if (staffId) {
      const selected = salesUsers.find((user) => user.id === staffId)
      if (selected) {
        return selected
      }
    }

    let pool = salesUsers.filter((user) => user.status === 'active' && user.isAvailable !== false)

    if (department) {
      const departmentMatches = pool.filter((user) => user.department === department)
      if (departmentMatches.length) {
        pool = departmentMatches
      }
    }

    if (requiredSkill) {
      const skillMatches = pool.filter((user) =>
        user.skills?.some((skill) => skill.toLowerCase().includes(requiredSkill.toLowerCase()))
      )
      if (skillMatches.length) {
        pool = skillMatches
      }
    }

    const underCapacity = pool.filter((user) => getUserLoad(user.id) < (user.maxActiveLeads || Number.MAX_SAFE_INTEGER))
    if (underCapacity.length) {
      pool = underCapacity
    }

    return [...pool].sort((a, b) => getUserLoad(a.id) - getUserLoad(b.id))[0] || salesUsers[0] || users[0]
  }

  const resetForm = () => {
    setEditingLeadId(null)
    setFormState({
      ...defaultFormState,
      assignedTo: '',
      nextFollowUp: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString().slice(0, 16),
      tags: 'new, automation',
    })
    setDialogMode('create')
  }

  const openCreateDialog = () => {
    resetForm()
    setIsDialogOpen(true)
  }

  const openEditDialog = (lead: Lead) => {
    setDialogMode('edit')
    setEditingLeadId(lead.id)
    setFormState({
      name: lead.name,
      email: lead.email,
      phone: lead.phone || '',
      company: lead.company,
      source: lead.source,
      notes: lead.notes || '',
      assignedTo: lead.assignedTo,
      priority: lead.priority || 'medium',
      nextFollowUp: lead.nextFollowUp ? lead.nextFollowUp.slice(0, 16) : '',
      department: lead.department || '',
      requiredSkill: lead.requiredSkill || '',
      tags: lead.tags?.join(', ') || '',
    })
    setIsDialogOpen(true)
  }

  const handleFieldChange = <K extends keyof LeadFormState>(field: K, value: LeadFormState[K]) => {
    setFormState((current) => ({ ...current, [field]: value }))
  }

  const saveLead = () => {
    if (!formState.name.trim() || (!formState.phone.trim() && !formState.email.trim())) {
      setActivityMessage('Add a lead name and at least one contact method before saving.')
      return
    }

    const now = new Date().toISOString()
    const assignedUser = selectLocalAssignee(formState.assignedTo, formState.requiredSkill, formState.department)
    const nextFollowUp = formState.nextFollowUp
      ? new Date(formState.nextFollowUp).toISOString()
      : new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString()
    const tags = formState.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    if (dialogMode === 'edit' && editingLeadId) {
      const updates = {
        name: formState.name.trim(),
        email: formState.email.trim(),
        phone: formState.phone.trim(),
        company: formState.company.trim() || 'Independent',
        source: formState.source,
        notes: formState.notes.trim(),
        assignedTo: assignedUser?.id || '1',
        assignedUserName: assignedUser?.name || 'Sarah Chen',
        priority: formState.priority,
        nextFollowUp,
        department: formState.department || assignedUser?.department,
        requiredSkill: formState.requiredSkill || undefined,
        tags,
        lastActivity: now,
      }

      updateLead(editingLeadId, updates)
      void updateLeadInApi(editingLeadId, updates)
      setActivityMessage(`${formState.name} was updated and assigned to ${updates.assignedUserName}.`)
    } else {
      const newLead: Lead = {
        id: String(Date.now()),
        name: formState.name.trim(),
        email: formState.email.trim() || 'pending@lead.local',
        phone: formState.phone.trim(),
        company: formState.company.trim() || 'Independent',
        title: 'Prospect',
        source: formState.source,
        status: 'new',
        score: formState.source === 'meta_ads' ? 92 : 74,
        value: formState.source === 'meta_ads' ? 45000 : 25000,
        assignedTo: assignedUser?.id || '1',
        assignedUserName: assignedUser?.name || 'Sarah Chen',
        department: formState.department || assignedUser?.department,
        requiredSkill: formState.requiredSkill || undefined,
        tags: tags.length ? tags : [formState.source, 'automation'],
        notes: formState.notes.trim() || 'Lead created from the CRM desk.',
        lastActivity: now,
        createdAt: now,
        lastContacted: now,
        lastContactChannel: 'system',
        nextFollowUp,
        priority: formState.priority,
        conversationPreview: 'Automated welcome message queued on WhatsApp.',
        aiSummary: 'Lead scored automatically from source quality and response likelihood.',
        aiInsights: ['Auto-assigned using round robin', 'Welcome template queued', 'Priority routing enabled'],
        timeline: [
          {
            id: `timeline-${Date.now()}`,
            type: 'system',
            title: 'Lead created',
            description: 'New lead was added, prioritized, and assigned to a staff member in the CRM.',
            timestamp: now,
          },
        ],
        messages: [
          {
            id: `message-${Date.now()}`,
            channel: 'whatsapp',
            direction: 'outbound',
            body: `Hi ${formState.name.trim()}, thanks for contacting Nexus CRM. We will reach out shortly.`,
            templateName: 'new_lead_welcome',
            status: 'sent',
            timestamp: now,
          },
        ],
        callLogs: [],
        automation: { autoAssigned: true, lastWorkflow: 'new-lead-welcome', chatbotEnabled: true },
      }

      addLead(newLead)
      void createLeadInApi({
        name: newLead.name,
        email: newLead.email,
        phone: newLead.phone,
        company: newLead.company,
        source: newLead.source,
        notes: newLead.notes,
        assignedTo: newLead.assignedTo,
        priority: newLead.priority,
        nextFollowUp: newLead.nextFollowUp,
        department: newLead.department,
        requiredSkill: newLead.requiredSkill,
        tags: newLead.tags,
      })
      setActivityMessage(
        `${newLead.name} was captured, assigned to ${newLead.assignedUserName}, and added to the follow-up queue.`
      )
    }

    setIsDialogOpen(false)
    resetForm()
  }

  const handleCall = (lead: Lead) => {
    const now = new Date().toISOString()
    updateLead(lead.id, {
      lastContacted: now,
      lastContactChannel: 'call',
      lastActivity: now,
      notes: `${lead.notes ? `${lead.notes}\n` : ''}Call initiated from the CRM click-to-call action.`,
    })
    void logLeadCallInApi(lead.id, {
      provider: 'manual',
      direction: 'outbound',
      status: 'answered',
      duration: 0,
      notes: 'Click-to-call started from the lead table.',
    })
    setActivityMessage(`Calling ${lead.name}. The call activity has been linked to this lead.`)
  }

  const handleWhatsApp = (lead: Lead) => {
    const now = new Date().toISOString()
    updateLead(lead.id, {
      lastContacted: now,
      lastContactChannel: 'whatsapp',
      lastActivity: now,
      conversationPreview: 'WhatsApp follow-up launched from the lead table.',
    })
    void sendLeadMessageInApi(lead.id, {
      channel: 'whatsapp',
      direction: 'outbound',
      body: `Hi ${lead.name}, following up from Nexus CRM.`,
      templateName: 'manual_followup',
      status: 'sent',
    })
    window.open(buildWhatsAppUrl(lead), '_blank', 'noopener,noreferrer')
    setActivityMessage(`WhatsApp follow-up opened for ${lead.name}. Delivery status will be tracked by webhook.`)
  }

  const changeStatus = (leadId: string, status: LeadStatus) => {
    // Intercept 'converted' — open the conversion dialog instead of just updating
    if (status === 'converted') {
      const lead = leads.find((l) => l.id === leadId)
      if (lead) { setConvertTarget(lead); return }
    }
    updateLead(leadId, {
      status,
      lastActivity: new Date().toISOString(),
    })
    void updateLeadInApi(leadId, { status })
    setActivityMessage(`Lead stage updated to ${statusLabels[status]}.`)
  }

  const assignLeadToStaff = (leadId: string, staffId: string) => {
    const selectedStaff = salesUsers.find((user) => user.id === staffId)
    if (!selectedStaff) {
      return
    }

    const updates = {
      assignedTo: selectedStaff.id,
      assignedUserName: selectedStaff.name,
      lastActivity: new Date().toISOString(),
    }

    updateLead(leadId, updates)
    void updateLeadInApi(leadId, updates)
    setActivityMessage(`Lead reassigned to ${selectedStaff.name}.`)
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      <motion.div variants={itemVariants} className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Lead management</h1>
          <p className="text-muted">Capture, route, contact, and convert leads with automation and communication tracking.</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="mr-2 h-4 w-4" />
          Add Lead
        </Button>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{leads.length}</p>
            <p className="text-sm text-muted">Total leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{leads.filter((lead) => lead.status === 'new').length}</p>
            <p className="text-sm text-muted">Fresh inbound</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{highPriorityCount}</p>
            <p className="text-sm text-muted">High priority</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{dueTodayCount}</p>
            <p className="text-sm text-muted">Due in 24h</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{interestedCount}</p>
            <p className="text-sm text-muted">Interested leads</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-2xl font-bold">{formatCurrency(leads.reduce((total, lead) => total + lead.value, 0))}</p>
            <p className="text-sm text-muted">Pipeline value</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-2 p-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-medium">Live automation status</p>
              <p className="text-sm text-muted">{activityMessage}</p>
            </div>
            <Badge variant="outline" className="w-fit border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
              Automation online
            </Badge>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Smart staff assignment</CardTitle>
            <CardDescription>New leads are routed by availability, workload limit, department, and skill match.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {salesUsers.map((user) => (
              <div key={user.id} className="rounded-xl border border-border p-3 text-sm">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="font-medium">{user.name}</span>
                  <Badge variant="outline" className={user.isAvailable === false ? 'border-rose-500/20 bg-rose-500/10 text-rose-500' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'}>
                    {user.isAvailable === false ? 'Busy' : 'Available'}
                  </Badge>
                </div>
                <p className="text-muted">{user.department || 'General'} team</p>
                <p className="mt-1 text-muted">Load: {getUserLoad(user.id)} / {user.maxActiveLeads || '∞'}</p>
                <p className="mt-1 text-xs text-muted">Skills: {(user.skills || []).join(', ')}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneMissed className="h-4 w-4 text-amber-500" />
              Missed call alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{missedCallCount}</p>
            <p className="text-sm text-muted">Auto follow-ups sent after missed IVR calls.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-primary" />
              Pending follow-ups
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{unattendedCount}</p>
            <p className="text-sm text-muted">Leads needing outreach within the next 48 hours.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-violet-500" />
              AI scoring
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{Math.round(leads.reduce((sum, lead) => sum + lead.score, 0) / Math.max(1, leads.length))}</p>
            <p className="text-sm text-muted">Average score based on source quality and engagement.</p>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Lead filters
            </CardTitle>
            <CardDescription>Filter by status, source, priority, owner, or recency.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {/* Urgent action pill — spans full width */}
            <button
              onClick={() => setUrgentOnly((v) => !v)}
              className={`md:col-span-2 xl:col-span-6 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
                urgentOnly
                  ? 'border-rose-500/60 bg-rose-500/10 text-rose-400'
                  : 'border-border bg-secondary/30 text-muted hover:border-rose-500/40 hover:text-rose-400'
              }`}
            >
              <Zap className={`h-4 w-4 ${urgentOnly ? 'text-rose-400' : 'text-amber-500'}`} />
              <span>Requires Immediate Action</span>
              {urgentOnly && (
                <Badge className="ml-auto bg-rose-500/20 text-rose-400 border-rose-500/30 text-xs">
                  {filteredLeads.length} leads
                </Badge>
              )}
              {!urgentOnly && (
                <span className="ml-auto text-xs text-muted">
                  Overdue follow-ups &amp; high-intent spikes (score ≥ 85)
                </span>
              )}
            </button>
            <div className="relative md:col-span-2 xl:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <Input
                placeholder="Search by name, email, company, or phone"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-10"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as 'all' | LeadStatus)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All statuses</option>
              {leadStatusOptions.map((status) => (
                <option key={status} value={status}>
                  {statusLabels[status]}
                </option>
              ))}
            </select>
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as 'all' | LeadSource)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All sources</option>
              {leadSourceOptions.map((source) => (
                <option key={source} value={source}>
                  {sourceLabels[source]}
                </option>
              ))}
            </select>
            <select
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value as 'all' | LeadPriority)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All priority</option>
              {priorityOptions.map((priority) => (
                <option key={priority} value={priority}>
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={assignedFilter}
              onChange={(event) => setAssignedFilter(event.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="all">All owners</option>
              {salesUsers.map((user) => (
                <option key={user.id} value={user.name}>
                  {user.name}
                </option>
              ))}
            </select>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value as 'all' | 'today' | 'week' | 'month')}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm md:col-span-2 xl:col-span-1"
            >
              <option value="all">Any date</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="month">Last 30 days</option>
            </select>
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>Lead desk</CardTitle>
            <CardDescription>Use call, assign, WhatsApp, edit, and detail actions directly from each row.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* View toggle */}
            <div className="flex items-center gap-1 p-3 border-b border-border">
              <button
                onClick={() => setLeadDeskView('table')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  leadDeskView === 'table'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" /> Table
              </button>
              <button
                onClick={() => setLeadDeskView('map')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  leadDeskView === 'map'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Map className="w-3.5 h-3.5" /> Map View
              </button>
            </div>
            <div className="overflow-x-auto">
              {leadDeskView === 'map' ? (
                <div className="p-4">
                  <LeadMapView />
                </div>
              ) : (
              <table className="w-full min-w-[1180px]">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-muted">
                    <th className="p-4">Name</th>
                    <th className="p-4">Phone</th>
                    <th className="p-4">Source</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Assigned User</th>
                    <th className="p-4">Follow-up</th>
                    <th className="p-4">Last Contacted</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.map((lead) => {
                    const isOverdue = lead.nextFollowUp
                      ? new Date(lead.nextFollowUp).getTime() < Date.now()
                      : false
                    const isHighIntent = (lead.score ?? 0) >= 85
                    const isHighPriority = (lead.priority || 'medium') === 'high'
                    const isUrgent = isOverdue && isHighPriority
                    const rowClass = isUrgent
                      ? 'border-b border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10'
                      : isOverdue
                      ? 'border-b border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10'
                      : isHighIntent
                      ? 'border-b border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10'
                      : 'border-b border-border/80 hover:bg-secondary/40'
                    return (
                    <tr key={lead.id} className={rowClass}>
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <Avatar className="h-9 w-9">
                              <AvatarFallback>{getInitials(lead.name)}</AvatarFallback>
                            </Avatar>
                            {isUrgent && (
                              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                              </span>
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium">{lead.name}</p>
                              {isHighIntent && !isUrgent && (
                                <span title="High intent spike" className="text-violet-400"><Zap className="h-3 w-3" /></span>
                              )}
                            </div>
                            <p className="text-xs text-muted">{lead.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-sm">{lead.phone || 'Not provided'}</td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`h-2.5 w-2.5 rounded-full ${sourceStyles[lead.source] || 'bg-gray-500'}`} />
                          {sourceLabels[lead.source] || lead.source}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={statusStyles[lead.status]}>
                            {statusLabels[lead.status] || lead.status}
                          </Badge>
                          <select
                            value={lead.status}
                            onChange={(event) => changeStatus(lead.id, event.target.value as LeadStatus)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {leadStatusOptions.map((status) => (
                              <option key={status} value={status}>
                                {statusLabels[status]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="p-4">
                        {isHighPriority && isOverdue ? (
                          <div className="flex items-center gap-1.5">
                            <span className="relative flex h-2.5 w-2.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                            </span>
                            <Badge variant="outline" className="border-rose-500/60 bg-rose-500/15 text-rose-400 font-bold">
                              HIGH — OVERDUE
                            </Badge>
                          </div>
                        ) : isHighPriority ? (
                          <Badge variant="outline" className={priorityStyles['high']}>
                            HIGH
                          </Badge>
                        ) : (
                          <Badge variant="outline" className={priorityStyles[lead.priority || 'medium']}>
                            {(lead.priority || 'medium').toUpperCase()}
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="space-y-2">
                          <p className="text-sm font-medium">{getAssignedUserName(lead, users)}</p>
                          <select
                            value={lead.assignedTo}
                            onChange={(event) => assignLeadToStaff(lead.id, event.target.value)}
                            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                          >
                            {salesUsers.map((user) => (
                              <option key={user.id} value={user.id}>
                                {user.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="p-4 text-sm">
                        {isOverdue ? (
                          <div className="flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                            <div>
                              <p className="text-rose-400 font-medium">{lead.nextFollowUp ? formatDate(lead.nextFollowUp) : 'Overdue'}</p>
                              <p className="text-xs text-rose-400/70">Overdue follow-up</p>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p>{lead.nextFollowUp ? formatDate(lead.nextFollowUp) : 'Auto-scheduled'}</p>
                            <p className="text-xs text-muted">Scheduled</p>
                          </>
                        )}
                      </td>
                      <td className="p-4 text-sm">
                        <p>{lead.lastContacted ? formatRelativeTime(lead.lastContacted) : 'No activity'}</p>
                        <p className="text-xs text-muted">{lead.lastContacted ? formatDate(lead.lastContacted) : 'Awaiting first touch'}</p>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => handleCall(lead)} title="Call lead">
                            <Phone className="h-4 w-4 text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleWhatsApp(lead)} title="Send WhatsApp message">
                            <MessageCircle className="h-4 w-4 text-emerald-500" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEditDialog(lead)} title="Edit lead">
                            <Pencil className="h-4 w-4 text-amber-500" />
                          </Button>
                          <Button asChild size="icon" variant="ghost" title="View details">
                            <Link to={`/leads/${lead.id}`}>
                              <Eye className="h-4 w-4 text-violet-500" />
                            </Link>
                          </Button>
                        </div>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
              )}
            </div>

            {leadDeskView === 'table' && (
            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 text-sm md:flex-row md:items-center md:justify-between">
              <p className="text-muted">
                Showing {(page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredLeads.length)} of {filteredLeads.length} leads
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Prev
                </Button>
                <span className="text-muted">Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page === totalPages}>
                  Next
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <motion.div variants={itemVariants} className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Webhook className="h-4 w-4 text-primary" />
              Integration setup
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>Meta Ads webhooks capture new Facebook and Instagram forms.</p>
            <p>WhatsApp Cloud API templates trigger for new leads and missed calls.</p>
            <p>Twilio or Exotel events sync recordings and call outcomes automatically.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-violet-500" />
              AI assistance
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>Lead scoring highlights conversion potential using source and engagement signals.</p>
            <p>Call summaries and speech-to-text hooks are prepared in the backend services.</p>
            <p>Chatbot auto-replies can answer initial WhatsApp questions before handoff.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarClock className="h-4 w-4 text-emerald-500" />
              Workflow rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted">
            <p>New leads trigger auto-assignment and a welcome message.</p>
            <p>No-response leads enter a reminder queue for follow-up.</p>
            <p>Interested leads can be pushed to the next stage in one click.</p>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{dialogMode === 'create' ? 'Add new lead' : 'Edit lead'}</DialogTitle>
            <DialogDescription>
              Capture manual leads or update existing contact details without leaving the CRM.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input value={formState.name} onChange={(event) => handleFieldChange('name', event.target.value)} placeholder="Lead name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Company</label>
              <Input value={formState.company} onChange={(event) => handleFieldChange('company', event.target.value)} placeholder="Company name" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input value={formState.phone} onChange={(event) => handleFieldChange('phone', event.target.value)} placeholder="Phone number" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input value={formState.email} onChange={(event) => handleFieldChange('email', event.target.value)} placeholder="Email address" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Source</label>
              <select
                value={formState.source}
                onChange={(event) => handleFieldChange('source', event.target.value as LeadSource)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {leadSourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {sourceLabels[source]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign to staff member</label>
              <select
                value={formState.assignedTo}
                onChange={(event) => handleFieldChange('assignedTo', event.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Auto assign by smart rules</option>
                {salesUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Priority</label>
              <select
                value={formState.priority}
                onChange={(event) => handleFieldChange('priority', event.target.value as LeadPriority)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {priorityOptions.map((priority) => (
                  <option key={priority} value={priority}>
                    {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Next follow-up</label>
              <Input type="datetime-local" value={formState.nextFollowUp} onChange={(event) => handleFieldChange('nextFollowUp', event.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Preferred department</label>
              <Input value={formState.department} onChange={(event) => handleFieldChange('department', event.target.value)} placeholder="inbound, enterprise" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Required skill</label>
              <Input value={formState.requiredSkill} onChange={(event) => handleFieldChange('requiredSkill', event.target.value)} placeholder="whatsapp, enterprise, ivr" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Tags</label>
              <Input value={formState.tags} onChange={(event) => handleFieldChange('tags', event.target.value)} placeholder="vip, enterprise, hot" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Notes</label>
              <textarea
                value={formState.notes}
                onChange={(event) => handleFieldChange('notes', event.target.value)}
                rows={4}
                placeholder="Notes about source, urgency, or next steps"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveLead}>
              <Save className="mr-2 h-4 w-4" />
              Save lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Lead Conversion Dialog ─────────────────────────────────────────── */}
      <ConvertLeadDialog
        lead={convertTarget}
        open={!!convertTarget}
        onClose={() => setConvertTarget(null)}
        onConverted={() => setActivityMessage('Lead converted! Client profile and Deal created and linked in the pipeline.')}
      />
    </motion.div>
  )
}
