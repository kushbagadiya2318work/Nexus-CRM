import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  Briefcase,
  FileSignature,
  Calendar,
  ChevronRight,
  Clock,
  Edit2,
  Filter,
  KanbanSquare,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  TrendingUp,
  Trophy,
  X,
  XCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCRMStore } from '@/store'
import { formatCurrency, formatDate } from '@/lib/utils'
import { CommentThread } from '@/components/ui/comment-thread'
import { QuoteBuilder } from './QuoteBuilder'
import type { Deal, User } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────
type Stage = Deal['stage']
type Priority = NonNullable<Deal['priority']>

type DealFormData = {
  name: string
  clientName: string
  clientId: string
  value: string
  stage: Stage
  probability: string
  expectedCloseDate: string
  assignedTo: string
  description: string
  priority: Priority
  nextFollowUp: string
  tags: string
}

const blankForm = (): DealFormData => ({
  name: '',
  clientName: '',
  clientId: '',
  value: '',
  stage: 'prospecting',
  probability: '20',
  expectedCloseDate: new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
  assignedTo: '',
  description: '',
  priority: 'medium',
  nextFollowUp: '',
  tags: '',
})

// ── Stage config ───────────────────────────────────────────────────────────────
const STAGES: { id: Stage; label: string; color: string; dot: string; defaultProb: number }[] = [
  { id: 'prospecting',   label: 'Prospecting',   color: 'border-t-blue-500',    dot: 'bg-blue-500',    defaultProb: 20 },
  { id: 'qualification', label: 'Qualification', color: 'border-t-cyan-500',    dot: 'bg-cyan-500',    defaultProb: 40 },
  { id: 'proposal',      label: 'Proposal',      color: 'border-t-purple-500',  dot: 'bg-purple-500',  defaultProb: 60 },
  { id: 'negotiation',   label: 'Negotiation',   color: 'border-t-amber-500',   dot: 'bg-amber-500',   defaultProb: 80 },
  { id: 'closed-won',    label: 'Closed Won',    color: 'border-t-emerald-500', dot: 'bg-emerald-500', defaultProb: 100 },
  { id: 'closed-lost',   label: 'Closed Lost',   color: 'border-t-rose-500',    dot: 'bg-rose-500',    defaultProb: 0 },
]

const STAGE_BADGE: Record<Stage, string> = {
  'prospecting':   'border-blue-500/30 text-blue-400',
  'qualification': 'border-cyan-500/30 text-cyan-400',
  'proposal':      'border-purple-500/30 text-purple-400',
  'negotiation':   'border-amber-500/30 text-amber-400',
  'closed-won':    'border-emerald-500/30 text-emerald-400',
  'closed-lost':   'border-rose-500/30 text-rose-400',
}

const PRIORITY_BADGE: Record<Priority, string> = {
  low:    'border-sky-500/30 text-sky-400',
  medium: 'border-amber-500/30 text-amber-400',
  high:   'border-rose-500/30 text-rose-400',
}

// Stale threshold per stage (days without movement)
const STALE_DAYS: Record<Stage, number> = {
  prospecting:   14,
  qualification: 10,
  proposal:      7,
  negotiation:   5,
  'closed-won':  999,
  'closed-lost': 999,
}

// ── Automation helpers ─────────────────────────────────────────────────────────
function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
}

function isStale(deal: Deal): boolean {
  if (deal.stage === 'closed-won' || deal.stage === 'closed-lost') return false
  const refDate = deal.stageMovedAt ?? deal.updatedAt ?? deal.createdAt
  return daysSince(refDate) > STALE_DAYS[deal.stage]
}

function isClosingSoon(deal: Deal): boolean {
  if (deal.stage === 'closed-won' || deal.stage === 'closed-lost') return false
  const daysLeft = Math.ceil((new Date(deal.expectedCloseDate).getTime() - Date.now()) / 86_400_000)
  return daysLeft >= 0 && daysLeft <= 5
}

function isOverdueClose(deal: Deal): boolean {
  if (deal.stage === 'closed-won' || deal.stage === 'closed-lost') return false
  return new Date(deal.expectedCloseDate) < new Date()
}

// ── Animation ──────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

// ── Deal card ──────────────────────────────────────────────────────────────────
function DealCard({
  deal,
  users,
  onEdit,
  onDelete,
  onStageChange,
  onQuote,
  compact = false,
}: {
  deal: Deal
  users: User[]
  onEdit: (deal: Deal) => void
  onDelete: (id: string) => void
  onStageChange: (id: string, stage: Stage) => void
  onQuote: (deal: Deal) => void
  compact?: boolean
}) {
  const assignee = users.find((u: User) => u.id === deal.assignedTo)
  const stale = isStale(deal)
  const closingSoon = isClosingSoon(deal)
  const overdueClose = isOverdueClose(deal)

  return (
    <div className={`group rounded-xl border border-border bg-card transition-shadow hover:shadow-md ${compact ? 'p-3' : 'p-4'}`}>
      {/* Automation alert strip */}
      {(stale || overdueClose) && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-xs text-rose-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {overdueClose ? 'Close date passed — update required' : `Stale for ${daysSince(deal.stageMovedAt ?? deal.updatedAt)} days`}
        </div>
      )}
      {!overdueClose && closingSoon && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
          <Clock className="h-3 w-3 shrink-0" />
          Closing in {Math.ceil((new Date(deal.expectedCloseDate).getTime() - Date.now()) / 86_400_000)} day(s)
        </div>
      )}

      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Briefcase className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-sm leading-tight">{deal.name}</p>
            <p className="text-xs text-muted truncate">{deal.clientName}</p>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => onEdit(deal)}>
              <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit Deal
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuote(deal)}>
              <FileSignature className="mr-2 h-3.5 w-3.5" /> Generate Quote
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {STAGES.filter((s) => s.id !== deal.stage).map((s) => (
              <DropdownMenuItem key={s.id} onClick={() => onStageChange(deal.id, s.id)}>
                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${s.dot}`} />
                Move to {s.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-error" onClick={() => onDelete(deal.id)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <p className="text-muted">Value</p>
          <p className="font-semibold text-sm">{formatCurrency(deal.value)}</p>
        </div>
        <div>
          <p className="text-muted">Probability</p>
          <div className="flex items-center gap-1.5">
            <Progress value={deal.probability} className="flex-1 h-1.5" />
            <span className="font-medium">{deal.probability}%</span>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
        <Badge variant="outline" className={STAGE_BADGE[deal.stage]}>
          {deal.stage.replace('-', ' ')}
        </Badge>
        {deal.priority && (
          <Badge variant="outline" className={PRIORITY_BADGE[deal.priority]}>
            {deal.priority}
          </Badge>
        )}
        <span className="ml-auto flex items-center gap-1 text-muted">
          <Calendar className="h-3 w-3" />
          {formatDate(deal.expectedCloseDate)}
        </span>
      </div>

      {assignee && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-muted border-t border-border pt-2">
          <img src={assignee.avatar} className="h-4 w-4 rounded-full" alt="" />
          {assignee.name}
          {deal.nextFollowUp && (
            <span className="ml-auto text-xs text-muted">Follow-up {formatDate(deal.nextFollowUp)}</span>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export function DealsPage() {
  const { deals, addDeal, updateDeal, deleteDeal, users, currentUser } = useCRMStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board')
  const [priorityFilter, setPriorityFilter] = useState('all')

  // Form / edit modal
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [formData, setFormData] = useState<DealFormData>(blankForm())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Quote builder
  const [quoteTarget, setQuoteTarget] = useState<Deal | null>(null)

  // Lost-reason dialog
  const [lostReasonDealId, setLostReasonDealId] = useState<string | null>(null)
  const [lostReasonInput, setLostReasonInput] = useState('')

  // Automation alerts
  const [alertsDismissed, setAlertsDismissed] = useState(false)
  const prevAlertKey = useRef('')

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  // ── Automation: rebuild alert list ──────────────────────────────────────
  const automationAlerts = useMemo(
    () => deals.filter((d) => isStale(d) || isOverdueClose(d) || isClosingSoon(d)),
    [deals]
  )

  useEffect(() => {
    const key = automationAlerts.map((d) => d.id).join(',')
    if (key !== prevAlertKey.current) {
      prevAlertKey.current = key
      setAlertsDismissed(false)
    }
  }, [automationAlerts])

  // ── Filter & group ───────────────────────────────────────────────────────
  const filteredDeals = useMemo(
    () =>
      deals.filter((d) => {
        const q = searchQuery.toLowerCase()
        const matchSearch = d.name.toLowerCase().includes(q) || d.clientName.toLowerCase().includes(q)
        const matchStage = stageFilter === 'all' || d.stage === stageFilter
        const matchPriority = priorityFilter === 'all' || d.priority === priorityFilter
        return matchSearch && matchStage && matchPriority
      }),
    [deals, searchQuery, stageFilter, priorityFilter]
  )

  const dealsByStage = useMemo(
    () =>
      STAGES.reduce<Record<Stage, Deal[]>>((acc, s) => {
        acc[s.id] = filteredDeals.filter((d) => d.stage === s.id)
        return acc
      }, {} as Record<Stage, Deal[]>),
    [filteredDeals]
  )

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalPipeline = deals.filter((d) => d.stage !== 'closed-lost').reduce((a, d) => a + d.value, 0)
  const weightedForecast = deals.filter((d) => d.stage !== 'closed-lost').reduce((a, d) => a + (d.value * d.probability) / 100, 0)
  const wonDeals = deals.filter((d) => d.stage === 'closed-won')
  const wonRevenue = wonDeals.reduce((a, d) => a + d.value, 0)
  const closedTotal = deals.filter((d) => d.stage === 'closed-won' || d.stage === 'closed-lost').length
  const winRate = closedTotal ? Math.round((wonDeals.length / closedTotal) * 100) : 0

  // ── Stage change ─────────────────────────────────────────────────────────
  const handleStageChange = (id: string, newStage: Stage) => {
    if (newStage === 'closed-lost') {
      setLostReasonDealId(id)
      return
    }
    updateDeal(id, {
      stage: newStage,
      stageMovedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      probability: STAGES.find((s) => s.id === newStage)?.defaultProb ?? 50,
      actualCloseDate: newStage === 'closed-won' ? new Date().toISOString().substring(0, 10) : undefined,
    })
  }

  const confirmLostReason = () => {
    if (!lostReasonDealId) return
    updateDeal(lostReasonDealId, {
      stage: 'closed-lost',
      stageMovedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      probability: 0,
      lostReason: lostReasonInput.trim() || 'Not specified',
    })
    setLostReasonDealId(null)
    setLostReasonInput('')
  }

  // ── Form helpers ─────────────────────────────────────────────────────────
  const openAdd = () => {
    setFormData(blankForm())
    setFormError('')
    setEditingId(null)
    setFormMode('add')
  }

  const openEdit = (deal: Deal) => {
    setFormData({
      name: deal.name,
      clientName: deal.clientName,
      clientId: deal.clientId,
      value: String(deal.value),
      stage: deal.stage,
      probability: String(deal.probability),
      expectedCloseDate: deal.expectedCloseDate.substring(0, 10),
      assignedTo: deal.assignedTo,
      description: deal.description || '',
      priority: deal.priority || 'medium',
      nextFollowUp: deal.nextFollowUp?.substring(0, 10) || '',
      tags: deal.tags?.join(', ') || '',
    })
    setFormError('')
    setEditingId(deal.id)
    setFormMode('edit')
  }

  const submitForm = () => {
    if (!formData.name.trim()) { setFormError('Deal name is required.'); return }
    if (!formData.value || isNaN(Number(formData.value))) { setFormError('Valid value is required.'); return }
    if (!formData.expectedCloseDate) { setFormError('Expected close date is required.'); return }

    const base = {
      name: formData.name.trim(),
      clientName: formData.clientName.trim() || 'Unassigned',
      clientId: formData.clientId,
      value: Number(formData.value),
      stage: formData.stage,
      probability: Number(formData.probability),
      expectedCloseDate: formData.expectedCloseDate,
      assignedTo: formData.assignedTo || (currentUser?.id ?? '1'),
      description: formData.description.trim() || undefined,
      priority: formData.priority,
      nextFollowUp: formData.nextFollowUp || undefined,
      tags: formData.tags ? formData.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      updatedAt: new Date().toISOString(),
    }

    if (formMode === 'add') {
      addDeal({ ...base, id: `deal-${Date.now()}`, activities: [], createdAt: new Date().toISOString(), stageMovedAt: new Date().toISOString() })
    } else if (editingId) {
      updateDeal(editingId, base)
    }
    setFormMode(null)
  }

  const confirmDelete = () => {
    if (deleteTarget) { deleteDeal(deleteTarget); setDeleteTarget(null) }
  }

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* ── Automation alert banner ──────────────────────────────────────── */}
      {isAdmin && automationAlerts.length > 0 && !alertsDismissed && (
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="relative rounded-xl border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <button onClick={() => setAlertsDismissed(true)} className="absolute right-3 top-3 text-muted hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-400">
                {automationAlerts.length} deal{automationAlerts.length > 1 ? 's' : ''} need attention
              </p>
              <div className="mt-2 space-y-1.5">
                {automationAlerts.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    {isOverdueClose(d) ? <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      : isStale(d) ? <Clock className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      : <Bell className="h-3.5 w-3.5 text-blue-400 shrink-0" />}
                    <span className="font-medium">{d.name}</span>
                    <span className="text-muted">·</span>
                    <span className="text-muted">{d.clientName}</span>
                    <span className="text-muted">·</span>
                    {isOverdueClose(d) && (
                      <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">
                        Close date passed: {formatDate(d.expectedCloseDate)}
                      </span>
                    )}
                    {!isOverdueClose(d) && isStale(d) && (
                      <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                        Stale {daysSince(d.stageMovedAt ?? d.updatedAt)} days in {d.stage}
                      </span>
                    )}
                    {!isOverdueClose(d) && isClosingSoon(d) && (
                      <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-300">
                        Closing in {Math.ceil((new Date(d.expectedCloseDate).getTime() - Date.now()) / 86_400_000)} day(s)
                      </span>
                    )}
                    <button onClick={() => openEdit(d)} className="ml-auto text-xs text-primary underline underline-offset-2">
                      Update
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Lost reason dialog ───────────────────────────────────────────── */}
      <Dialog open={lostReasonDealId !== null} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <XCircle className="h-5 w-5" /> Deal Lost — Reason Required
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for marking this deal as lost.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {lostReasonDealId && (() => {
              const d = deals.find((x) => x.id === lostReasonDealId)
              return d ? (
                <div className="rounded-lg border border-border bg-secondary/40 p-3">
                  <p className="font-semibold">{d.name}</p>
                  <p className="text-sm text-muted">{d.clientName} · {formatCurrency(d.value)}</p>
                </div>
              ) : null
            })()}
            <div className="space-y-1">
              <label className="text-sm font-medium">Reason for loss *</label>
              <textarea
                value={lostReasonInput}
                onChange={(e) => setLostReasonInput(e.target.value)}
                rows={3}
                placeholder="e.g. Budget constraints, chose competitor, no decision…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLostReasonDealId(null); setLostReasonInput('') }}>Cancel</Button>
            <Button className="bg-rose-600 hover:bg-rose-700" onClick={confirmLostReason}>Mark as Lost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deals</h1>
          <p className="text-muted">Track and manage your sales pipeline</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> Add Deal
        </Button>
      </motion.div>

      {/* ── KPI stats ───────────────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
              <p className="text-xs text-muted">Pipeline Value</p>
            </div>
            <p className="text-xl font-bold">{formatCurrency(totalPipeline)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <ChevronRight className="h-4 w-4 text-cyan-400" />
              <p className="text-xs text-muted">Weighted Forecast</p>
            </div>
            <p className="text-xl font-bold">{formatCurrency(weightedForecast)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Trophy className="h-4 w-4 text-emerald-400" />
              <p className="text-xs text-muted">Won Revenue</p>
            </div>
            <p className="text-xl font-bold">{formatCurrency(wonRevenue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Filter className="h-4 w-4 text-amber-400" />
              <p className="text-xs text-muted">Win Rate</p>
            </div>
            <p className="text-xl font-bold">{winRate}%</p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Filters + view toggle ────────────────────────────────────────── */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search deals or clients…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Tabs value={priorityFilter} onValueChange={setPriorityFilter}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="high">High</TabsTrigger>
            <TabsTrigger value="medium">Medium</TabsTrigger>
            <TabsTrigger value="low">Low</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-1 rounded-md border border-input bg-background p-1">
          <button
            onClick={() => setViewMode('list')}
            title="List view"
            className={`rounded p-1.5 transition-colors ${viewMode === 'list' ? 'bg-primary/20 text-primary' : 'text-muted hover:text-foreground'}`}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode('board')}
            title="Board view"
            className={`rounded p-1.5 transition-colors ${viewMode === 'board' ? 'bg-primary/20 text-primary' : 'text-muted hover:text-foreground'}`}
          >
            <KanbanSquare className="h-4 w-4" />
          </button>
        </div>
      </motion.div>

      {/* ── BOARD VIEW ──────────────────────────────────────────────────── */}
      {viewMode === 'board' ? (
        <motion.div variants={itemVariants} className="overflow-x-auto pb-4">
          <div className="flex gap-4" style={{ minWidth: 900 }}>
            {STAGES.map((stage) => (
              <div key={stage.id} className="flex-1 min-w-[200px]">
                <div className={`flex flex-col rounded-xl border-t-4 ${stage.color} border border-border bg-secondary/30`} style={{ minHeight: 360 }}>
                  <div className="flex items-center justify-between px-3 pt-3 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} />
                      <span className="text-xs font-semibold">{stage.label}</span>
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-border px-1.5 text-xs">
                        {dealsByStage[stage.id].length}
                      </span>
                    </div>
                    <span className="text-xs text-muted">
                      {formatCurrency(dealsByStage[stage.id].reduce((a, d) => a + d.value, 0))}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 p-2">
                    <AnimatePresence>
                      {dealsByStage[stage.id].map((deal) => (
                        <motion.div key={deal.id} layout initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                          <DealCard deal={deal} users={users} onEdit={openEdit} onDelete={(id) => setDeleteTarget(id)} onStageChange={handleStageChange} onQuote={setQuoteTarget} compact />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                    {dealsByStage[stage.id].length === 0 && (
                      <div className="flex flex-1 items-center justify-center rounded-lg border-2 border-dashed border-border py-8 text-xs text-muted opacity-50">
                        No deals
                      </div>
                    )}
                  </div>
                  <button
                    onClick={openAdd}
                    className="mx-2 mb-2 flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-1.5 text-xs text-muted transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="h-3 w-3" /> Add
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      ) : (
        /* ── LIST VIEW ────────────────────────────────────────────────── */
        <motion.div variants={itemVariants}>
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2 flex-wrap">
                {(['all', ...STAGES.map((s) => s.id)] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStageFilter(s)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      stageFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted hover:text-foreground'
                    }`}
                  >
                    {s === 'all' ? 'All' : STAGES.find((x) => x.id === s)!.label}
                    {s !== 'all' && (
                      <span className="ml-1 opacity-70">{deals.filter((d) => d.stage === s).length}</span>
                    )}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {filteredDeals.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">No deals match your filters.</div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredDeals.map((deal) => {
                    const assignee = users.find((u) => u.id === deal.assignedTo)
                    const stale = isStale(deal)
                    const overdueClose = isOverdueClose(deal)
                    const closingSoon = isClosingSoon(deal)
                    return (
                      <div key={deal.id} className="flex items-center gap-4 p-4 hover:bg-secondary/50 transition-colors">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <Briefcase className="h-4 w-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{deal.name}</p>
                            {stale && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-400">Stale</span>}
                            {overdueClose && <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-400">Overdue Close</span>}
                            {!overdueClose && closingSoon && <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-xs text-blue-400">Closing Soon</span>}
                          </div>
                          <p className="text-sm text-muted">{deal.clientName}</p>
                        </div>
                        <div className="hidden md:flex items-center gap-6 text-sm shrink-0">
                          <div className="text-right">
                            <p className="font-semibold">{formatCurrency(deal.value)}</p>
                            <p className="text-xs text-muted">{deal.probability}% prob</p>
                          </div>
                          <Badge variant="outline" className={STAGE_BADGE[deal.stage]}>
                            {deal.stage.replace('-', ' ')}
                          </Badge>
                          <span className="flex items-center gap-1 text-muted text-xs">
                            <Calendar className="h-3.5 w-3.5" />
                            {formatDate(deal.expectedCloseDate)}
                          </span>
                          {assignee && <img src={assignee.avatar} className="h-6 w-6 rounded-full" title={assignee.name} alt="" />}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem onClick={() => openEdit(deal)}>
                              <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setQuoteTarget(deal)}>
                              <FileSignature className="mr-2 h-3.5 w-3.5" /> Generate Quote
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {STAGES.filter((s) => s.id !== deal.stage).map((s) => (
                              <DropdownMenuItem key={s.id} onClick={() => handleStageChange(deal.id, s.id)}>
                                <span className={`mr-2 inline-block h-2 w-2 rounded-full ${s.dot}`} />
                                Move to {s.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-error" onClick={() => setDeleteTarget(deal.id)}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Add / Edit dialog ────────────────────────────────────────────── */}
      <Dialog open={formMode !== null} onOpenChange={(open) => !open && setFormMode(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode === 'add' ? 'Add New Deal' : 'Edit Deal'}</DialogTitle>
            <DialogDescription>
              {formMode === 'add' ? 'Create a new deal in the pipeline.' : 'Update deal details below.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Deal name *</label>
              <Input value={formData.name} onChange={(e) => setFormData((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Enterprise License Q2" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Client name</label>
                <Input value={formData.clientName} onChange={(e) => setFormData((f) => ({ ...f, clientName: e.target.value }))} placeholder="Client name" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Value ($) *</label>
                <Input type="number" min={0} value={formData.value} onChange={(e) => setFormData((f) => ({ ...f, value: e.target.value }))} placeholder="0" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Stage</label>
                <select
                  value={formData.stage}
                  onChange={(e) => {
                    const s = e.target.value as Stage
                    setFormData((f) => ({ ...f, stage: s, probability: String(STAGES.find((x) => x.id === s)?.defaultProb ?? f.probability) }))
                  }}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Probability (%)</label>
                <Input type="number" min={0} max={100} value={formData.probability} onChange={(e) => setFormData((f) => ({ ...f, probability: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Expected close *</label>
                <Input type="date" value={formData.expectedCloseDate} onChange={(e) => setFormData((f) => ({ ...f, expectedCloseDate: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Next follow-up</label>
                <Input type="date" value={formData.nextFollowUp} onChange={(e) => setFormData((f) => ({ ...f, nextFollowUp: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData((f) => ({ ...f, priority: e.target.value as Priority }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Assign to</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData((f) => ({ ...f, assignedTo: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Unassigned —</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Tags (comma-separated)</label>
              <Input value={formData.tags} onChange={(e) => setFormData((f) => ({ ...f, tags: e.target.value }))} placeholder="enterprise, upsell, renewal" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Optional notes…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {formError && <p className="rounded-md bg-error/10 p-2 text-sm text-error">{formError}</p>}

          {/* Team Comments thread — only when editing */}
          {formMode === 'edit' && editingId && (() => {
            const deal = deals.find(d => d.id === editingId)
            return deal ? (
              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  Team Comments
                  {(deal.comments?.length ?? 0) > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{deal.comments!.length}</span>
                  )}
                </p>
                <CommentThread
                  entityType="deal"
                  entityId={deal.id}
                  comments={deal.comments ?? []}
                />
              </div>
            ) : null
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormMode(null)}>Cancel</Button>
            <Button onClick={submitForm}>{formMode === 'add' ? 'Create Deal' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ───────────────────────────────────────────────── */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete deal?</DialogTitle>
            <DialogDescription>
              {(() => {
                const d = deals.find((x) => x.id === deleteTarget)
                return `"${d?.name || 'This deal'}" will be permanently deleted.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Quote Builder ────────────────────────────────────────────────── */}
      {quoteTarget && (
        <QuoteBuilder deal={quoteTarget} open={!!quoteTarget} onClose={() => setQuoteTarget(null)} />
      )}

    </motion.div>
  )
}

