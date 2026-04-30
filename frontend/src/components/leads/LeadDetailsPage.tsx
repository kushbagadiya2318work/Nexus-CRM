import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileAudio,
  MessageCircle,
  Mic,
  Phone,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Video,
  Zap,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useCRMStore } from '@/store'
import { updateLeadInApi } from '@/lib/crm-api'
import { ConvertLeadDialog } from './ConvertLeadDialog'
import {
  buildWhatsAppUrl,
  getAssignedUserName,
  getLeadTimeline,
  sourceLabels,
  statusLabels,
  statusStyles,
} from '@/lib/lead-utils'
import { formatDate, formatRelativeTime, getInitials } from '@/lib/utils'
import type { CallIntelligence, CallMoment, Lead, LeadStatus } from '@/types'

const stageOptions: LeadStatus[] = ['new', 'contacted', 'interested', 'not_interested', 'converted']
const priorityOptions = ['low', 'medium', 'high'] as const

// ── Static mock intelligence data (would come from Zoom/Teams webhook) ─────────
const MOCK_CALL: CallIntelligence = {
  id: 'ci-demo-1',
  provider: 'zoom',
  recordedAt: new Date(Date.now() - 1000 * 3600 * 3).toISOString(),
  durationSec: 2340,
  participantNames: ['You', 'Sarah Chen (TechCorp)'],
  overallSentiment: 'positive',
  sentimentScore: 74,
  summary:
    'Prospect confirmed budget approval was in process. They are evaluating NexusAI against Salesforce CRM. Key concerns were onboarding timeline and API integration depth. Strong positive signal when demo of AI scoring was shown.',
  moments: [
    {
      id: 'm1',
      type: 'competitor_mention',
      label: 'Competitor Mentioned: Salesforce',
      quote: '"We\'re also talking to Salesforce, but their pricing is quite steep for our current scale."',
      timestampSec: 480,
    },
    {
      id: 'm2',
      type: 'budget_concern',
      label: 'Budget Concern',
      quote: '"Our Q2 budget ceiling is around $50k annually, so we need to keep it under that."',
      timestampSec: 720,
    },
    {
      id: 'm3',
      type: 'objection',
      label: 'Objection: Integration Complexity',
      quote: '"How long does the API integration with our existing HubSpot data warehouse actually take?"',
      timestampSec: 1100,
    },
    {
      id: 'm4',
      type: 'positive_signal',
      label: 'Positive Signal: AI Scoring Demo',
      quote: '"Oh wow, this is exactly what we needed — the lead scoring view is much cleaner than what we have now."',
      timestampSec: 1560,
    },
    {
      id: 'm5',
      type: 'next_step',
      label: 'Next Step Agreed',
      quote: '"Let\'s schedule a technical deep-dive with our CTO next Tuesday."',
      timestampSec: 2200,
    },
  ],
}

const MOMENT_CONFIG: Record<
  CallMoment['type'],
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  competitor_mention: {
    label: 'Competitor',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/20',
    icon: <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />,
  },
  budget_concern: {
    label: 'Budget',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    icon: <TrendingUp className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />,
  },
  objection: {
    label: 'Objection',
    color: 'text-orange-400',
    bg: 'bg-orange-500/10 border-orange-500/20',
    icon: <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0 mt-0.5" />,
  },
  positive_signal: {
    label: 'Positive',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10 border-emerald-500/20',
    icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />,
  },
  next_step: {
    label: 'Next Step',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    icon: <Zap className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />,
  },
  pain_point: {
    label: 'Pain Point',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10 border-purple-500/20',
    icon: <AlertTriangle className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />,
  },
}

function fmt(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Call Intelligence card ─────────────────────────────────────────────────────
function CallIntelligenceCard(_: { leadName: string }) {
  const [expanded, setExpanded] = useState(false)
  const [synced, setSynced] = useState(false)

  const call = MOCK_CALL
  const flagged = call.moments.filter(m => m.type === 'competitor_mention' || m.type === 'budget_concern' || m.type === 'objection')
  const positive = call.moments.filter(m => m.type === 'positive_signal' || m.type === 'next_step')
  const providerIcon = call.provider === 'zoom' ? <Video className="h-4 w-4 text-blue-400" /> : <Users className="h-4 w-4 text-purple-400" />

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
              <Mic className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <CardTitle className="text-base">Call Intelligence</CardTitle>
              <CardDescription className="text-xs">
                {call.provider === 'zoom' ? 'Zoom' : 'MS Teams'} · {fmt(call.durationSec)} · {formatRelativeTime(call.recordedAt)}
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {providerIcon}
            <Badge variant="outline" className={call.overallSentiment === 'positive' ? 'border-emerald-500/30 text-emerald-400' : call.overallSentiment === 'negative' ? 'border-rose-500/30 text-rose-400' : 'border-slate-500/30 text-slate-400'}>
              {call.sentimentScore}/100 sentiment
            </Badge>
            <Button
              size="sm"
              variant={synced ? 'outline' : 'default'}
              className="h-7 text-xs gap-1"
              onClick={() => setSynced(true)}
              disabled={synced}
            >
              {synced ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Synced</> : <><Sparkles className="h-3 w-3" /> Sync to Client Profile</>}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <p className="text-sm text-muted leading-relaxed border-l-2 border-border pl-3 italic">
          {call.summary}
        </p>

        {/* Flagged moments */}
        {flagged.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">⚠ Flagged Moments</p>
            <div className="space-y-2">
              {flagged.map(m => {
                const cfg = MOMENT_CONFIG[m.type]
                return (
                  <div key={m.id} className={`rounded-lg border p-3 ${cfg.bg}`}>
                    <div className="flex items-start gap-2">
                      {cfg.icon}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-bold ${cfg.color}`}>{m.label}</span>
                          <span className="text-xs text-muted">at {fmt(m.timestampSec)}</span>
                        </div>
                        <p className="text-sm text-muted">{m.quote}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Positive / next steps */}
        {positive.length > 0 && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">✓ Positive Signals & Next Steps</p>
            <div className="space-y-2">
              {positive.map(m => {
                const cfg = MOMENT_CONFIG[m.type]
                return (
                  <div key={m.id} className={`rounded-lg border p-3 ${cfg.bg}`}>
                    <div className="flex items-start gap-2">
                      {cfg.icon}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-xs font-bold ${cfg.color}`}>{m.label}</span>
                          <span className="text-xs text-muted">at {fmt(m.timestampSec)}</span>
                        </div>
                        <p className="text-sm text-muted">{m.quote}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* What to say section */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">🤖 AI — What to Say Next</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-400 shrink-0 mt-0.5" />
                    <p><span className="font-medium text-rose-400">On Salesforce:</span> <span className="text-muted">Emphasize our native AI scoring and 60% lower TCO. Send the "NexusAI vs Salesforce" comparison sheet.</span></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <TrendingUp className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <p><span className="font-medium text-amber-400">On Budget ($50k ceiling):</span> <span className="text-muted">Offer the Growth plan at $3,800/mo (well under ceiling). Highlight ROI calculator showing 8× return in 6 months.</span></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <BookOpen className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />
                    <p><span className="font-medium text-blue-400">On Integration:</span> <span className="text-muted">Share the HubSpot migration guide and mention our 2-day onboarding SLA. Offer a technical POC call with our solutions engineer.</span></p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1">
            {call.participantNames.map((p, i) => (
              <span key={i} className="text-xs text-muted">{i > 0 ? ', ' : ''}{p}</span>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setExpanded(v => !v)}>
            {expanded ? <><ChevronUp className="h-3.5 w-3.5" />Hide guidance</> : <><ChevronDown className="h-3.5 w-3.5" />What to say next</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function LeadDetailsPage() {
  const { id } = useParams()
  const { leads, users, updateLead } = useCRMStore()
  const [convertTarget, setConvertTarget] = useState<Lead | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const salesUsers = useMemo(
    () => users.filter((user) => user.role === 'sales' || user.role === 'manager'),
    [users]
  )

  const lead = useMemo(() => leads.find((item) => item.id === id), [id, leads])

  if (!lead) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Lead not found</h1>
        <p className="text-sm text-muted">The selected lead is no longer available in the CRM.</p>
        <Button asChild>
          <Link to="/leads">Return to lead desk</Link>
        </Button>
      </div>
    )
  }

  const owner = getAssignedUserName(lead, users)
  const timeline = getLeadTimeline({ ...lead, assignedUserName: owner }, users)

  const saveNote = () => {
    if (!noteDraft.trim()) {
      return
    }

    const now = new Date().toISOString()
    const updates = {
      notes: `${lead.notes ? `${lead.notes}\n` : ''}${noteDraft.trim()}`,
      lastActivity: now,
      lastContacted: now,
      lastContactChannel: 'note' as const,
    }

    updateLead(lead.id, updates)
    void updateLeadInApi(lead.id, updates)
    setNoteDraft('')
  }

  const updateStage = (status: LeadStatus) => {
    if (status === 'converted') {
      setConvertTarget(lead)
      return
    }
    const updates = {
      status,
      lastActivity: new Date().toISOString(),
      lastContacted: new Date().toISOString(),
    }

    updateLead(lead.id, updates)
    void updateLeadInApi(lead.id, updates)
  }

  const updateOwner = (staffId: string) => {
    const selected = salesUsers.find((user) => user.id === staffId)
    if (!selected) {
      return
    }

    const updates = {
      assignedTo: selected.id,
      assignedUserName: selected.name,
      lastActivity: new Date().toISOString(),
    }

    updateLead(lead.id, updates)
    void updateLeadInApi(lead.id, updates)
  }

  const updatePriority = (priority: 'low' | 'medium' | 'high') => {
    const updates = {
      priority,
      lastActivity: new Date().toISOString(),
    }

    updateLead(lead.id, updates)
    void updateLeadInApi(lead.id, updates)
  }

  const updateFollowUp = (value: string) => {
    const updates = {
      nextFollowUp: value ? new Date(value).toISOString() : undefined,
      lastActivity: new Date().toISOString(),
    }

    updateLead(lead.id, updates)
    void updateLeadInApi(lead.id, updates)
  }

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" className="w-fit px-0">
            <Link to="/leads">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to lead desk
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={`https://i.pravatar.cc/150?u=${lead.email}`} />
              <AvatarFallback>{getInitials(lead.name)}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold">{lead.name}</h1>
              <p className="text-sm text-muted">{lead.company} • {lead.email}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={statusStyles[lead.status]}>
            {statusLabels[lead.status] || lead.status}
          </Badge>
          <Badge variant="outline">{sourceLabels[lead.source] || lead.source}</Badge>
          <Button asChild>
            <a href={lead.phone ? `tel:${lead.phone}` : '#'}>
              <Phone className="mr-2 h-4 w-4" />
              Call
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={buildWhatsAppUrl(lead)} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              WhatsApp
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Lead timeline</CardTitle>
              <CardDescription>Calls, messages, notes, and stage changes linked to this lead.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {timeline.map((item) => (
                <div key={item.id} className="rounded-xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{item.title}</p>
                      <p className="text-sm text-muted">{item.description}</p>
                    </div>
                    <div className="text-right text-xs text-muted">
                      <p>{formatRelativeTime(item.timestamp)}</p>
                      <p>{formatDate(item.timestamp)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <CallIntelligenceCard leadName={lead.name} />

          <Card>
            <CardHeader>
              <CardTitle>Quick stage controls</CardTitle>
              <CardDescription>Move the lead through the sales workflow instantly.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {stageOptions.map((status) => (
                <Button
                  key={status}
                  variant={lead.status === status ? 'default' : 'outline'}
                  onClick={() => updateStage(status)}
                >
                  {statusLabels[status]}
                </Button>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Lead summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted">Assigned user</span>
                <span className="font-medium">{owner}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Phone</span>
                <span className="font-medium">{lead.phone || 'Not provided'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">AI score</span>
                <span className="font-medium">{lead.score}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Priority</span>
                <span className="font-medium capitalize">{lead.priority || 'medium'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Preferred team</span>
                <span className="font-medium">{lead.department || 'Any team'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Required skill</span>
                <span className="font-medium">{lead.requiredSkill || 'General sales'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Expected value</span>
                <span className="font-medium">${lead.value.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">Next follow-up</span>
                <span className="font-medium">{lead.nextFollowUp ? formatDate(lead.nextFollowUp) : 'Auto-scheduled'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Assignment & follow-up</CardTitle>
              <CardDescription>Assign the lead to a staff member and schedule the next touchpoint.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Assigned staff member</label>
                <select
                  value={lead.assignedTo}
                  onChange={(event) => updateOwner(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
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
                  value={lead.priority || 'medium'}
                  onChange={(event) => updatePriority(event.target.value as 'low' | 'medium' | 'high')}
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
                <input
                  type="datetime-local"
                  value={lead.nextFollowUp ? lead.nextFollowUp.slice(0, 16) : ''}
                  onChange={(event) => updateFollowUp(event.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Automation & integrations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Sparkles className="mt-0.5 h-4 w-4 text-primary" />
                <span>Auto-assignment and follow-up rules are active for new inbound leads.</span>
              </div>
              <div className="flex items-start gap-2">
                <FileAudio className="mt-0.5 h-4 w-4 text-primary" />
                <span>IVR recordings can be attached through the call webhook payload.</span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
                <span>JWT auth, activity logging, and role checks are ready in the API layer.</span>
              </div>
              <div className="flex items-start gap-2">
                <CalendarClock className="mt-0.5 h-4 w-4 text-primary" />
                <span>Missed-call follow-up templates and reminder scheduling are enabled.</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Add note</CardTitle>
              <CardDescription>Attach context after every call or chat.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                rows={5}
                placeholder="Add call notes, follow-up summary, or objection handling details..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <Button onClick={saveNote} className="w-full">
                Save note to timeline
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>

      {convertTarget && (
        <ConvertLeadDialog
          lead={convertTarget}
          open={!!convertTarget}
          onClose={() => setConvertTarget(null)}
          onConverted={() => setConvertTarget(null)}
        />
      )}
    </>
  )
}
