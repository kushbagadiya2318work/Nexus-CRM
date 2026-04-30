import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Edit2,
  GitBranch,
  Mail,
  MessageSquare,
  Phone,
  Play,
  Plus,
  Trash2,
  User,
  X,
  Zap,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCRMStore } from '@/store'
import type {
  Workflow,
  WorkflowCondition,
  WorkflowAction,
  WorkflowTriggerType,
  WorkflowActionType,
} from '@/types'

// ── Config ─────────────────────────────────────────────────────────────────────
const TRIGGER_LABELS: Record<WorkflowTriggerType, string> = {
  lead_score_above:    'Lead score is above',
  lead_score_below:    'Lead score is below',
  lead_status_changed: 'Lead status changes to',
  deal_stage_changed:  'Deal stage changes to',
  no_contact_days:     'No contact for (days)',
  lead_source:         'Lead source is',
  deal_value_above:    'Deal value is above',
  task_overdue:        'Task is overdue',
}

const ACTION_LABELS: Record<WorkflowActionType, string> = {
  send_whatsapp:      'Send WhatsApp',
  send_email:         'Send Email',
  send_sms:           'Send SMS',
  create_task:        'Create Task',
  assign_to_user:     'Assign to User',
  add_tag:            'Add Tag',
  change_lead_status: 'Change Lead Status',
  change_deal_stage:  'Change Deal Stage',
  send_linkedin:      'Send LinkedIn Message',
  notify_admin:       'Notify Admin',
}

const ACTION_ICON: Record<WorkflowActionType, React.ReactNode> = {
  send_whatsapp:      <MessageSquare className="h-3.5 w-3.5 text-green-400" />,
  send_email:         <Mail className="h-3.5 w-3.5 text-blue-400" />,
  send_sms:           <Phone className="h-3.5 w-3.5 text-purple-400" />,
  create_task:        <Check className="h-3.5 w-3.5 text-amber-400" />,
  assign_to_user:     <User className="h-3.5 w-3.5 text-cyan-400" />,
  add_tag:            <GitBranch className="h-3.5 w-3.5 text-pink-400" />,
  change_lead_status: <Zap className="h-3.5 w-3.5 text-orange-400" />,
  change_deal_stage:  <Zap className="h-3.5 w-3.5 text-orange-400" />,
  send_linkedin:      <User className="h-3.5 w-3.5 text-blue-500" />,
  notify_admin:       <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />,
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

// ── Blank helpers ──────────────────────────────────────────────────────────────
const blankCondition = (): WorkflowCondition => ({
  id: `c-${Date.now()}-${Math.random()}`,
  trigger: 'lead_score_above',
  operator: 'greater_than',
  value: '',
})

const blankAction = (): WorkflowAction => ({
  id: `a-${Date.now()}-${Math.random()}`,
  type: 'send_whatsapp',
  config: { message: '' },
})

// ── Workflow Card ──────────────────────────────────────────────────────────────
function WorkflowCard({
  workflow,
  onToggle,
  onEdit,
  onDelete,
}: {
  workflow: Workflow
  onToggle: (id: string) => void
  onEdit: (w: Workflow) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <Card className={`transition-shadow hover:shadow-md ${!workflow.isActive ? 'opacity-60' : ''}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${workflow.isActive ? 'bg-primary/10' : 'bg-secondary'}`}>
              <Zap className={`h-4 w-4 ${workflow.isActive ? 'text-primary' : 'text-muted'}`} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{workflow.name}</p>
                <Badge variant="outline" className={workflow.isActive ? 'border-emerald-500/30 text-emerald-400' : 'border-slate-500/30 text-slate-400'}>
                  {workflow.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <p className="text-sm text-muted mt-0.5">{workflow.description}</p>
              <div className="mt-2 flex items-center gap-4 text-xs text-muted">
                <span>{workflow.conditions.length} condition{workflow.conditions.length !== 1 ? 's' : ''}</span>
                <span>→</span>
                <span>{workflow.actions.length} action{workflow.actions.length !== 1 ? 's' : ''}</span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <Play className="h-3 w-3" /> {workflow.executionCount} runs
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onToggle(workflow.id)}>
              <Zap className={`h-3.5 w-3.5 ${workflow.isActive ? 'text-emerald-400' : 'text-muted'}`} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(workflow)}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-error" onClick={() => onDelete(workflow.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setExpanded(!expanded)}>
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                {/* Conditions */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">
                    When ({workflow.triggerLogic} conditions match)
                  </p>
                  <div className="space-y-1.5">
                    {workflow.conditions.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-1.5 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-muted">{TRIGGER_LABELS[c.trigger]}</span>
                        <span className="font-medium">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Then do</p>
                  <div className="space-y-1.5">
                    {workflow.actions.map((a, i) => (
                      <div key={a.id} className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-1.5 text-sm">
                        <span className="text-xs text-muted w-4 shrink-0">{i + 1}.</span>
                        {ACTION_ICON[a.type]}
                        <span>{ACTION_LABELS[a.type]}</span>
                        {(a.config.message || a.config.taskTitle || a.config.tag) && (
                          <span className="text-muted truncate max-w-[200px]">
                            — {a.config.message || a.config.taskTitle || a.config.tag}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export function WorkflowsPage() {
  const { workflows, addWorkflow, updateWorkflow, deleteWorkflow, users, currentUser } = useCRMStore()

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [triggerLogic, setTriggerLogic] = useState<'AND' | 'OR'>('AND')
  const [conditions, setConditions] = useState<WorkflowCondition[]>([blankCondition()])
  const [actions, setActions] = useState<WorkflowAction[]>([blankAction()])
  const [formError, setFormError] = useState('')

  const openAdd = () => {
    setName(''); setDescription(''); setTriggerLogic('AND')
    setConditions([blankCondition()]); setActions([blankAction()])
    setFormError(''); setEditingId(null); setFormOpen(true)
  }

  const openEdit = (w: Workflow) => {
    setName(w.name); setDescription(w.description); setTriggerLogic(w.triggerLogic)
    setConditions(w.conditions.map(c => ({ ...c }))); setActions(w.actions.map(a => ({ ...a, config: { ...a.config } })))
    setFormError(''); setEditingId(w.id); setFormOpen(true)
  }

  const submitForm = () => {
    if (!name.trim()) { setFormError('Workflow name is required.'); return }
    if (conditions.some(c => !c.value.trim())) { setFormError('All condition values are required.'); return }
    if (actions.some(a => !a.config.message && !a.config.taskTitle && !a.config.assignTo && !a.config.tag && !a.config.status && !a.config.stage)) {
      setFormError('Each action needs at least one configured value.'); return
    }

    const base: Omit<Workflow, 'id' | 'executionCount' | 'createdAt' | 'createdBy'> = {
      name: name.trim(), description: description.trim(),
      isActive: true, triggerLogic, conditions, actions,
    }

    if (editingId) {
      updateWorkflow(editingId, base)
    } else {
      addWorkflow({ ...base, id: `wf-${Date.now()}`, executionCount: 0, createdAt: new Date().toISOString(), createdBy: currentUser?.id ?? '1' })
    }
    setFormOpen(false)
  }

  // Condition helpers
  const updateCondition = (id: string, patch: Partial<WorkflowCondition>) =>
    setConditions(cs => cs.map(c => c.id === id ? { ...c, ...patch } : c))
  const removeCondition = (id: string) => setConditions(cs => cs.filter(c => c.id !== id))

  // Action helpers
  const updateAction = (id: string, patch: Partial<WorkflowAction>) =>
    setActions(as => as.map(a => a.id === id ? { ...a, ...patch } : a))
  const updateActionConfig = (id: string, config: Partial<WorkflowAction['config']>) =>
    setActions(as => as.map(a => a.id === id ? { ...a, config: { ...a.config, ...config } } : a))
  const removeAction = (id: string) => setActions(as => as.filter(a => a.id !== id))

  const activeCount = workflows.filter(w => w.isActive).length
  const totalRuns    = workflows.reduce((s, w) => s + w.executionCount, 0)

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Workflow Builder</h1>
          <p className="text-muted">Create "if-this-then-that" automation rules for your sales pipeline</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" /> New Workflow
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: 'Total Workflows', value: workflows.length, icon: <GitBranch className="h-4 w-4 text-primary" /> },
          { label: 'Active',          value: activeCount,       icon: <Zap className="h-4 w-4 text-emerald-400" /> },
          { label: 'Total Runs',      value: totalRuns,         icon: <Play className="h-4 w-4 text-cyan-400" /> },
          { label: 'Inactive',        value: workflows.length - activeCount, icon: <X className="h-4 w-4 text-slate-400" /> },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">{stat.icon}<p className="text-xs text-muted">{stat.label}</p></div>
              <p className="text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* How it works */}
      <motion.div variants={itemVariants}>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Zap className="mt-0.5 h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="font-semibold text-primary">How Workflows Work</p>
                <p className="text-sm text-muted mt-1">
                  Workflows run automatically when their conditions match. For example: <em>"If a lead score goes above 90, assign to Sarah and send a WhatsApp."</em> Workflows with <strong>AND</strong> logic require all conditions to match; <strong>OR</strong> logic requires any one to match.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Workflow list */}
      <motion.div variants={itemVariants} className="space-y-4">
        {workflows.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted text-sm">No workflows yet. Click "New Workflow" to create one.</CardContent></Card>
        ) : (
          workflows.map(w => (
            <WorkflowCard
              key={w.id} workflow={w}
              onToggle={(id) => updateWorkflow(id, { isActive: !workflows.find(x => x.id === id)?.isActive })}
              onEdit={openEdit}
              onDelete={(id) => setDeleteTarget(id)}
            />
          ))
        )}
      </motion.div>

      {/* ── Builder Dialog ───────────────────────────────────────────────── */}
      <Dialog open={formOpen} onOpenChange={(open) => !open && setFormOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-primary" />
              {editingId ? 'Edit Workflow' : 'Create Workflow'}
            </DialogTitle>
            <DialogDescription>
              Define when this workflow triggers and what actions to take.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Basic info */}
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Workflow name *</label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. High-Intent Lead Fast Track" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={2}
                  placeholder="What does this workflow do?"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Conditions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm">Trigger Conditions</p>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">Logic:</span>
                  <div className="flex rounded-md border border-input overflow-hidden">
                    {(['AND', 'OR'] as const).map(l => (
                      <button
                        key={l}
                        onClick={() => setTriggerLogic(l)}
                        className={`px-3 py-1 text-xs font-medium transition-colors ${triggerLogic === l ? 'bg-primary text-primary-foreground' : 'text-muted hover:text-foreground'}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {conditions.map((c) => (
                <div key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 p-3">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <select
                      value={c.trigger}
                      onChange={e => updateCondition(c.id, { trigger: e.target.value as WorkflowTriggerType })}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {Object.entries(TRIGGER_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <select
                      value={c.operator}
                      onChange={e => updateCondition(c.id, { operator: e.target.value as WorkflowCondition['operator'] })}
                      className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      <option value="equals">equals</option>
                      <option value="not_equals">not equals</option>
                      <option value="greater_than">greater than</option>
                      <option value="less_than">less than</option>
                      <option value="contains">contains</option>
                    </select>
                    <Input
                      className="h-8 text-xs"
                      placeholder="value"
                      value={c.value}
                      onChange={e => updateCondition(c.id, { value: e.target.value })}
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-error"
                    onClick={() => removeCondition(c.id)} disabled={conditions.length === 1}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setConditions(cs => [...cs, blankCondition()])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add condition
              </Button>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <p className="font-semibold text-sm">Then do these actions</p>

              {actions.map((a, i) => (
                <div key={a.id} className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted w-5 shrink-0">{i + 1}.</span>
                    <select
                      value={a.type}
                      onChange={e => updateAction(a.id, { type: e.target.value as WorkflowActionType, config: {} })}
                      className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                    >
                      {Object.entries(ACTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-error"
                      onClick={() => removeAction(a.id)} disabled={actions.length === 1}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Action-specific config */}
                  {(a.type === 'send_whatsapp' || a.type === 'send_sms' || a.type === 'send_linkedin' || a.type === 'notify_admin') && (
                    <textarea
                      rows={2}
                      placeholder="Message (use {{name}}, {{company}} etc.)"
                      value={a.config.message || ''}
                      onChange={e => updateActionConfig(a.id, { message: e.target.value })}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                    />
                  )}
                  {a.type === 'send_email' && (
                    <div className="space-y-2">
                      <Input className="h-8 text-xs" placeholder="Subject" value={a.config.subject || ''} onChange={e => updateActionConfig(a.id, { subject: e.target.value })} />
                      <textarea rows={2} placeholder="Email body" value={a.config.message || ''} onChange={e => updateActionConfig(a.id, { message: e.target.value })}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-ring" />
                    </div>
                  )}
                  {a.type === 'create_task' && (
                    <div className="flex gap-2">
                      <Input className="h-8 text-xs flex-1" placeholder="Task title" value={a.config.taskTitle || ''} onChange={e => updateActionConfig(a.id, { taskTitle: e.target.value })} />
                      <select value={a.config.taskPriority || 'medium'} onChange={e => updateActionConfig(a.id, { taskPriority: e.target.value as 'low' | 'medium' | 'high' })}
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs">
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  )}
                  {a.type === 'assign_to_user' && (
                    <select value={a.config.assignTo || ''} onChange={e => updateActionConfig(a.id, { assignTo: e.target.value })}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                      <option value="">— Select user —</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>
                  )}
                  {a.type === 'add_tag' && (
                    <Input className="h-8 text-xs" placeholder="Tag name" value={a.config.tag || ''} onChange={e => updateActionConfig(a.id, { tag: e.target.value })} />
                  )}
                  {(a.type === 'change_lead_status') && (
                    <select value={a.config.status || ''} onChange={e => updateActionConfig(a.id, { status: e.target.value })}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                      <option value="">— Select status —</option>
                      {['new','contacted','interested','not_interested','qualified','proposal','negotiation','won','lost'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                  {a.type === 'change_deal_stage' && (
                    <select value={a.config.stage || ''} onChange={e => updateActionConfig(a.id, { stage: e.target.value })}
                      className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
                      <option value="">— Select stage —</option>
                      {['prospecting','qualification','proposal','negotiation','closed-won','closed-lost'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              ))}

              <Button variant="outline" size="sm" onClick={() => setActions(as => [...as, blankAction()])}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Add action
              </Button>
            </div>
          </div>

          {formError && <p className="rounded-md bg-error/10 p-2 text-sm text-error">{formError}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={submitForm}>{editingId ? 'Save Changes' : 'Create Workflow'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete workflow?</DialogTitle>
            <DialogDescription>
              {`"${workflows.find(w => w.id === deleteTarget)?.name || 'This workflow'}" will be permanently deleted.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (deleteTarget) { deleteWorkflow(deleteTarget); setDeleteTarget(null) } }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  )
}
