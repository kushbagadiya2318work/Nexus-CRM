/**
 * ConvertLeadDialog
 *
 * Shown when a rep marks a lead as "Converted".
 * Collects deal details, then calls store.convertLead() which:
 *   1. Creates (or reuses) a Client record
 *   2. Creates a Deal linked to that Client
 *   3. Marks the Lead as converted with a timeline entry
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  BadgeDollarSign,
  Briefcase,
  Building2,
  CalendarClock,
  Check,
  User,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useCRMStore } from '@/store'
import type { Deal, Lead } from '@/types'

type Stage = Deal['stage']

const STAGES: { id: Stage; label: string; dot: string; prob: number }[] = [
  { id: 'prospecting',   label: 'Prospecting',   dot: 'bg-blue-500',    prob: 20 },
  { id: 'qualification', label: 'Qualification', dot: 'bg-cyan-500',    prob: 40 },
  { id: 'proposal',      label: 'Proposal',      dot: 'bg-purple-500',  prob: 60 },
  { id: 'negotiation',   label: 'Negotiation',   dot: 'bg-amber-500',   prob: 80 },
]

interface Props {
  lead: Lead | null
  open: boolean
  onClose: () => void
  /** Called after successful conversion so caller can show a toast/banner */
  onConverted?: (dealId: string) => void
}

export function ConvertLeadDialog({ lead, open, onClose, onConverted }: Props) {
  const { convertLead, users } = useCRMStore()
  const navigate = useNavigate()

  const [dealName, setDealName] = useState('')
  const [dealValue, setDealValue] = useState('')
  const [stage, setStage] = useState<Stage>('qualification')
  const [assignedTo, setAssignedTo] = useState('')
  const [closeDate, setCloseDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
  )
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ dealId: string } | null>(null)

  const salesUsers = users.filter((u) => u.role === 'sales' || u.role === 'manager')

  // Seed form when lead changes
  useEffect(() => {
    if (!lead || !open) return
    setDealName(`${lead.company} — ${lead.name}`)
    setDealValue(String(lead.value || 25000))
    setAssignedTo(lead.assignedTo || salesUsers[0]?.id || '')
    setStage('qualification')
    setCloseDate(new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10))
    setNotes('')
    setError('')
    setDone(null)
  }, [lead, open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleConvert() {
    if (!lead) return
    if (!dealName.trim()) { setError('Deal name is required.'); return }
    const val = parseFloat(dealValue)
    if (isNaN(val) || val <= 0) { setError('Enter a valid deal value.'); return }
    if (!closeDate) { setError('Expected close date is required.'); return }

    try {
      const { deal } = convertLead(lead.id, {
        dealName: dealName.trim(),
        dealValue: val,
        dealStage: stage,
        dealAssignedTo: assignedTo || salesUsers[0]?.id || '1',
        expectedCloseDate: closeDate,
        notes: notes.trim() || undefined,
      })
      setDone({ dealId: deal.id })
      onConverted?.(deal.id)
    } catch (e) {
      setError(String(e))
    }
  }

  function handleGoToDeal() {
    onClose()
    navigate('/deals')
  }

  if (!lead) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-4 w-4 text-emerald-400" />
            Convert Lead to Deal
          </DialogTitle>
          <DialogDescription>
            Qualifying this lead creates a <strong>Client record</strong> and a <strong>Deal</strong> in the pipeline.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            className="space-y-4 py-2"
          >
            <div className="flex flex-col items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                <Check className="h-7 w-7 text-emerald-400" />
              </div>
              <div>
                <p className="font-semibold text-emerald-400">Lead successfully converted!</p>
                <p className="mt-1 text-sm text-muted">
                  A <strong>Client profile</strong> and a <strong>Deal</strong> have been created and linked.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center text-sm">
              <div className="rounded-xl border border-border bg-secondary/30 p-3">
                <User className="mx-auto mb-1 h-5 w-5 text-muted" />
                <p className="font-medium">Lead</p>
                <Badge variant="outline" className="mt-1 text-xs border-slate-500/30 text-slate-400">Converted</Badge>
              </div>
              <div className="flex items-center justify-center text-muted">
                <ArrowRight className="h-5 w-5" />
              </div>
              <div className="rounded-xl border border-border bg-secondary/30 p-3">
                <Briefcase className="mx-auto mb-1 h-5 w-5 text-emerald-400" />
                <p className="font-medium">Deal Created</p>
                <Badge variant="outline" className="mt-1 text-xs border-emerald-500/30 text-emerald-400">{stage}</Badge>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-xs text-muted mb-0.5">Pipeline entry</p>
              <p className="font-semibold">{dealName}</p>
              <p className="text-sm text-muted">{lead.company} · ${parseInt(dealValue || '0').toLocaleString()}</p>
            </div>
          </motion.div>
        ) : (
          /* ── Form ──────────────────────────────────────────────────────── */
          <div className="space-y-4">
            {/* Lead summary pill */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 p-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{lead.name}</p>
                <p className="text-xs text-muted truncate">{lead.company} · {lead.email}</p>
              </div>
              <Badge variant="outline" className="ml-auto shrink-0 border-primary/30 text-primary text-xs">
                Score: {lead.score}
              </Badge>
            </div>

            {/* Deal name */}
            <div className="space-y-1">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 text-muted" /> Deal Name *
              </label>
              <Input
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                placeholder="e.g. TechCorp Enterprise License"
                className="h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Value */}
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <BadgeDollarSign className="h-3.5 w-3.5 text-muted" /> Deal Value ($) *
                </label>
                <Input
                  type="number"
                  min={0}
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  placeholder="25000"
                  className="h-9"
                />
              </div>

              {/* Close date */}
              <div className="space-y-1">
                <label className="text-sm font-medium flex items-center gap-1.5">
                  <CalendarClock className="h-3.5 w-3.5 text-muted" /> Expected Close *
                </label>
                <Input
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {/* Pipeline stage */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Enter Pipeline at Stage</label>
              <div className="flex flex-wrap gap-2">
                {STAGES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setStage(s.id)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                      stage === s.id
                        ? 'bg-primary/20 border-primary/50 text-primary'
                        : 'bg-secondary border-border text-muted hover:text-foreground'
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                    {s.label}
                    <span className="opacity-60">·{s.prob}%</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Assign rep */}
            <div className="space-y-1">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted" /> Assign Deal To
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {salesUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Conversion Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Why was this lead qualified? Any context for the deal..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
            </div>

            {error && (
              <p className="text-xs text-rose-400 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2">
                {error}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <>
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={handleGoToDeal} className="gap-1.5">
                <Briefcase className="h-3.5 w-3.5" /> Go to Deals
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={handleConvert} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                <ArrowRight className="h-3.5 w-3.5" /> Convert &amp; Create Deal
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
