/**
 * Shared Team Inbox — unified communications view per company.
 *
 * Aggregates all calls, messages, notes, and timeline entries across leads
 * and clients that belong to the same company, so reps can see at a glance
 * who has already contacted them and avoid double-contacting.
 */
import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowDownLeft,
  ArrowUpRight,
  AtSign,
  Building2,
  ChevronDown,
  ChevronUp,
  FileText,
  Filter,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
  Search,
  Shield,
  Users,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useCRMStore } from '@/store'
import { formatRelativeTime, getInitials } from '@/lib/utils'
import type { User } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────
type EntryKind = 'call' | 'whatsapp' | 'sms' | 'email' | 'note' | 'comment' | 'timeline'

interface InboxEntry {
  id: string
  kind: EntryKind
  direction?: 'inbound' | 'outbound'
  body: string
  authorId?: string
  authorName: string
  company: string
  companyContact?: string   // lead / client name
  channel?: string
  timestamp: string
  mentions?: string[]       // user IDs
  sourceType: 'lead' | 'client'
  sourceId: string
  sourceName: string
}

// ── Config ─────────────────────────────────────────────────────────────────────
const KIND_META: Record<EntryKind, { icon: React.ReactNode; label: string; color: string; bg: string }> = {
  call:     { icon: <Phone className="h-3.5 w-3.5" />,        label: 'Call',      color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  whatsapp: { icon: <MessageSquare className="h-3.5 w-3.5" />, label: 'WhatsApp',  color: 'text-green-400',   bg: 'bg-green-500/10' },
  sms:      { icon: <Phone className="h-3.5 w-3.5" />,        label: 'SMS',       color: 'text-cyan-400',    bg: 'bg-cyan-500/10' },
  email:    { icon: <Mail className="h-3.5 w-3.5" />,         label: 'Email',     color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  note:     { icon: <FileText className="h-3.5 w-3.5" />,     label: 'Note',      color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  comment:  { icon: <AtSign className="h-3.5 w-3.5" />,       label: 'Comment',   color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  timeline: { icon: <Shield className="h-3.5 w-3.5" />,       label: 'Activity',  color: 'text-slate-400',   bg: 'bg-slate-500/10' },
}

const KIND_FILTERS: { id: EntryKind | 'all'; label: string }[] = [
  { id: 'all',      label: 'All' },
  { id: 'call',     label: 'Calls' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'email',    label: 'Email' },
  { id: 'note',     label: 'Notes' },
  { id: 'comment',  label: 'Comments' },
]

// ── Animation ──────────────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 },
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function userById(users: User[], id?: string) {
  return users.find(u => u.id === id)
}

/** Renders @mention text with highlighted spans */
function renderBody(body: string) {
  const parts = body.split(/(@[\w ]+)/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="rounded bg-primary/15 px-1 text-primary font-medium">{part}</span>
      : <span key={i}>{part}</span>
  )
}

// ── Company group header ───────────────────────────────────────────────────────
function CompanyGroup({
  company,
  entries,
  users,
}: {
  company: string
  entries: InboxEntry[]
  users: User[]
}) {
  const [collapsed, setCollapsed] = useState(false)

  // Who has contacted this company (unique reps)
  const repsInvolved = useMemo(() => {
    const ids = new Set<string>()
    entries.forEach(e => { if (e.authorId) ids.add(e.authorId) })
    return [...ids].map(id => userById(users, id)).filter(Boolean) as User[]
  }, [entries, users])

  const lastEntry = entries[0]
  const unread = entries.filter(e => e.kind === 'call' && e.direction === 'inbound').length

  return (
    <Card className="overflow-hidden">
      {/* Group header */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 cursor-pointer hover:bg-secondary/50 transition-colors"
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold">{company}</p>
              <Badge variant="outline" className="text-xs">{entries.length} interactions</Badge>
              {unread > 0 && (
                <Badge variant="outline" className="text-xs border-rose-500/30 text-rose-400">{unread} inbound calls</Badge>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">Last activity {formatRelativeTime(lastEntry.timestamp)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {/* Rep avatars */}
          <div className="flex -space-x-2">
            {repsInvolved.slice(0, 4).map(rep => (
              <Avatar key={rep.id} className="h-6 w-6 border-2 border-background">
                <AvatarImage src={rep.avatar} />
                <AvatarFallback className="text-[9px]">{getInitials(rep.name)}</AvatarFallback>
              </Avatar>
            ))}
            {repsInvolved.length > 4 && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-secondary text-[9px] text-muted">
                +{repsInvolved.length - 4}
              </div>
            )}
          </div>
          {collapsed ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronUp className="h-4 w-4 text-muted" />}
        </div>
      </div>

      {/* ── Double-contact warning ── */}
      {!collapsed && repsInvolved.length > 1 && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <Users className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-300">
            <span className="font-semibold">Multiple reps active:</span>{' '}
            {repsInvolved.map(r => r.name).join(', ')} have all contacted {company}.
            Coordinate before reaching out again to avoid double-contacting.
          </p>
        </div>
      )}

      {/* Entries */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="divide-y divide-border">
              {entries.map(entry => {
                const meta = KIND_META[entry.kind]
                const author = userById(users, entry.authorId)
                return (
                  <div key={entry.id} className="flex items-start gap-3 px-5 py-3 hover:bg-secondary/30 transition-colors">
                    {/* Kind icon */}
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${meta.bg} ${meta.color}`}>
                      {meta.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <Avatar className="h-5 w-5 shrink-0">
                          <AvatarImage src={author?.avatar} />
                          <AvatarFallback className="text-[9px]">{getInitials(entry.authorName)}</AvatarFallback>
                        </Avatar>
                        <span className="text-xs font-semibold">{entry.authorName}</span>
                        <Badge variant="outline" className={`text-xs py-0 ${meta.color} border-current`}>{meta.label}</Badge>
                        {entry.direction && (
                          <span className={`flex items-center gap-0.5 text-xs ${entry.direction === 'inbound' ? 'text-emerald-400' : 'text-slate-400'}`}>
                            {entry.direction === 'inbound'
                              ? <ArrowDownLeft className="h-3 w-3" />
                              : <ArrowUpRight className="h-3 w-3" />}
                            {entry.direction}
                          </span>
                        )}
                        {entry.companyContact && (
                          <span className="text-xs text-muted">with <span className="font-medium">{entry.companyContact}</span></span>
                        )}
                        <span className="ml-auto text-xs text-muted">{formatRelativeTime(entry.timestamp)}</span>
                      </div>
                      <p className="text-sm text-muted leading-snug">{renderBody(entry.body)}</p>
                      {entry.mentions && entry.mentions.length > 0 && (
                        <div className="mt-1 flex items-center gap-1 flex-wrap">
                          {entry.mentions.map(uid => {
                            const u = userById(users, uid)
                            return u ? (
                              <Badge key={uid} variant="outline" className="text-primary border-primary/30 text-xs py-0 px-1.5">
                                @{u.name.split(' ')[0]}
                              </Badge>
                            ) : null
                          })}
                          <span className="text-[10px] text-muted">mentioned</span>
                        </div>
                      )}
                      <p className="mt-0.5 text-xs text-muted opacity-60">{entry.sourceType}: {entry.sourceName}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function TeamInboxPage() {
  const { leads, clients, tasks, deals, users } = useCRMStore()
  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<EntryKind | 'all'>('all')

  // Build unified entries from all data sources
  const allEntries: InboxEntry[] = useMemo(() => {
    const entries: InboxEntry[] = []

    // ── From leads ────────────────────────────────────────────────────────────
    leads.forEach(lead => {
      // Call logs
      lead.callLogs?.forEach(call => {
        const rep = userById(users, lead.assignedTo)
        entries.push({
          id: `lead-call-${call.id}`,
          kind: 'call',
          direction: call.direction,
          body: call.notes ?? `${call.direction} call · ${call.status} · ${Math.floor(call.duration / 60)}m ${call.duration % 60}s`,
          authorId: lead.assignedTo,
          authorName: rep?.name ?? lead.assignedUserName ?? 'Unknown',
          company: lead.company,
          companyContact: lead.name,
          timestamp: call.timestamp,
          sourceType: 'lead',
          sourceId: lead.id,
          sourceName: lead.name,
        })
      })

      // Messages
      lead.messages?.forEach(msg => {
        const rep = userById(users, lead.assignedTo)
        entries.push({
          id: `lead-msg-${msg.id}`,
          kind: msg.channel === 'whatsapp' ? 'whatsapp' : msg.channel === 'email' ? 'email' : 'sms',
          direction: msg.direction,
          body: msg.body,
          authorId: msg.direction === 'outbound' ? lead.assignedTo : undefined,
          authorName: msg.direction === 'outbound' ? (rep?.name ?? 'Rep') : lead.name,
          company: lead.company,
          companyContact: lead.name,
          timestamp: msg.timestamp,
          sourceType: 'lead',
          sourceId: lead.id,
          sourceName: lead.name,
        })
      })

      // Timeline notes
      lead.timeline?.filter(t => t.type === 'note').forEach(t => {
        const rep = userById(users, lead.assignedTo)
        entries.push({
          id: `lead-tl-${t.id}`,
          kind: 'note',
          body: t.description,
          authorId: lead.assignedTo,
          authorName: rep?.name ?? 'Rep',
          company: lead.company,
          companyContact: lead.name,
          timestamp: t.timestamp,
          sourceType: 'lead',
          sourceId: lead.id,
          sourceName: lead.name,
        })
      })

      // Lead notes field
      if (lead.notes) {
        const rep = userById(users, lead.assignedTo)
        entries.push({
          id: `lead-notes-${lead.id}`,
          kind: 'note',
          body: lead.notes,
          authorId: lead.assignedTo,
          authorName: rep?.name ?? 'Rep',
          company: lead.company,
          companyContact: lead.name,
          timestamp: lead.lastActivity,
          sourceType: 'lead',
          sourceId: lead.id,
          sourceName: lead.name,
        })
      }
    })

    // ── From clients ──────────────────────────────────────────────────────────
    clients.forEach(client => {
      client.callLogs?.forEach(call => {
        const rep = userById(users, client.accountOwnerId ?? '')
        entries.push({
          id: `client-call-${call.id}`,
          kind: 'call',
          direction: call.direction,
          body: call.notes ?? `${call.direction} call · ${call.status}`,
          authorId: client.accountOwnerId,
          authorName: rep?.name ?? client.accountOwnerName ?? 'Rep',
          company: client.company,
          companyContact: client.name,
          timestamp: call.timestamp,
          sourceType: 'client',
          sourceId: client.id,
          sourceName: client.name,
        })
      })

      client.messages?.forEach(msg => {
        const rep = userById(users, client.accountOwnerId ?? '')
        entries.push({
          id: `client-msg-${msg.id}`,
          kind: msg.channel === 'whatsapp' ? 'whatsapp' : msg.channel === 'email' ? 'email' : 'sms',
          direction: msg.direction,
          body: msg.body,
          authorId: msg.direction === 'outbound' ? client.accountOwnerId : undefined,
          authorName: msg.direction === 'outbound' ? (rep?.name ?? 'Rep') : client.name,
          company: client.company,
          companyContact: client.name,
          timestamp: msg.timestamp,
          sourceType: 'client',
          sourceId: client.id,
          sourceName: client.name,
        })
      })

      if (client.notes) {
        const rep = userById(users, client.accountOwnerId ?? '')
        entries.push({
          id: `client-notes-${client.id}`,
          kind: 'note',
          body: client.notes,
          authorId: client.accountOwnerId,
          authorName: rep?.name ?? 'Rep',
          company: client.company,
          companyContact: client.name,
          timestamp: client.lastContact,
          sourceType: 'client',
          sourceId: client.id,
          sourceName: client.name,
        })
      }
    })

    // ── Task comments ─────────────────────────────────────────────────────────
    tasks.forEach(task => {
      task.comments?.forEach(c => {
        const company = task.relatedTo
          ? leads.find(l => l.id === task.relatedTo?.id)?.company
            ?? clients.find(cl => cl.id === task.relatedTo?.id)?.company
            ?? 'Unknown'
          : 'Internal'
        entries.push({
          id: `task-cmt-${c.id}`,
          kind: 'comment',
          body: c.body,
          authorId: c.authorId,
          authorName: c.authorName,
          company,
          timestamp: c.createdAt,
          mentions: c.mentions,
          sourceType: 'lead',
          sourceId: task.id,
          sourceName: `Task: ${task.title}`,
        })
      })
    })

    // ── Deal comments ─────────────────────────────────────────────────────────
    deals.forEach(deal => {
      deal.comments?.forEach(c => {
        entries.push({
          id: `deal-cmt-${c.id}`,
          kind: 'comment',
          body: c.body,
          authorId: c.authorId,
          authorName: c.authorName,
          company: deal.clientName,
          timestamp: c.createdAt,
          mentions: c.mentions,
          sourceType: 'client',
          sourceId: deal.id,
          sourceName: `Deal: ${deal.name}`,
        })
      })
    })

    return entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  }, [leads, clients, tasks, deals, users])

  // Filter by search + kind
  const filtered = useMemo(() => {
    let list = allEntries
    if (kindFilter !== 'all') list = list.filter(e => e.kind === kindFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(e =>
        e.company.toLowerCase().includes(q) ||
        e.body.toLowerCase().includes(q) ||
        e.authorName.toLowerCase().includes(q) ||
        (e.companyContact ?? '').toLowerCase().includes(q)
      )
    }
    return list
  }, [allEntries, kindFilter, search])

  // Group by company
  const grouped = useMemo(() => {
    const map = new Map<string, InboxEntry[]>()
    filtered.forEach(e => {
      if (!map.has(e.company)) map.set(e.company, [])
      map.get(e.company)!.push(e)
    })
    // Sort companies by most-recent entry
    return [...map.entries()].sort((a, b) =>
      new Date(b[1][0].timestamp).getTime() - new Date(a[1][0].timestamp).getTime()
    )
  }, [filtered])

  const totalInteractions = allEntries.length

  // Count companies with multiple reps
  const multiRepCount = useMemo(() => {
    const companyReps = new Map<string, Set<string>>()
    allEntries.forEach(e => {
      if (!companyReps.has(e.company)) companyReps.set(e.company, new Set())
      if (e.authorId) companyReps.get(e.company)!.add(e.authorId)
    })
    return [...companyReps.values()].filter(s => s.size > 1).length
  }, [allEntries])

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Shared Team Inbox
          </h1>
          <p className="text-muted">All team communications unified by company — avoid double-contacting</p>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Interactions', value: totalInteractions, icon: <MessageSquare className="h-4 w-4 text-primary" />, color: 'bg-primary/10' },
          { label: 'Companies Active', value: grouped.length, icon: <Building2 className="h-4 w-4 text-cyan-400" />, color: 'bg-cyan-500/10' },
          { label: 'Multi-Rep Warning', value: multiRepCount, icon: <Users className="h-4 w-4 text-amber-400" />, color: 'bg-amber-500/10' },
          { label: 'Team Comments', value: allEntries.filter(e => e.kind === 'comment').length, icon: <AtSign className="h-4 w-4 text-purple-400" />, color: 'bg-purple-500/10' },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={`flex h-6 w-6 items-center justify-center rounded-md ${stat.color}`}>{stat.icon}</div>
                <p className="text-xs text-muted">{stat.label}</p>
              </div>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Multi-rep alert banner */}
      {multiRepCount > 0 && (
        <motion.div variants={itemVariants}>
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
            <Users className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-300">
              <span className="font-semibold">{multiRepCount} {multiRepCount === 1 ? 'company has' : 'companies have'} multiple reps in contact.</span>{' '}
              Review the highlighted company groups below and coordinate outreach to avoid sending duplicate messages.
            </p>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div variants={itemVariants} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            className="pl-9"
            placeholder="Search company, content, or rep…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          <Filter className="h-4 w-4 text-muted mr-1" />
          {KIND_FILTERS.map(f => (
            <Button
              key={f.id}
              size="sm"
              variant={kindFilter === f.id ? 'default' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setKindFilter(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </motion.div>

      {/* Company groups */}
      <motion.div variants={itemVariants} className="space-y-4">
        {grouped.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center">
              <Inbox className="mx-auto h-10 w-10 text-muted mb-3" />
              <p className="text-sm text-muted">No interactions found{search ? ` for "${search}"` : ''}.</p>
            </CardContent>
          </Card>
        ) : (
          grouped.map(([company, entries]) => (
            <CompanyGroup key={company} company={company} entries={entries} users={users} />
          ))
        )}
      </motion.div>

    </motion.div>
  )
}
