import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  Calendar,
  GripVertical,
  KanbanSquare,
  List,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Edit2,
  X,
} from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCRMStore } from '@/store'
import { formatDate } from '@/lib/utils'
import { CommentThread } from '@/components/ui/comment-thread'
import type { Task } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────
type TaskStatus = Task['status']
type TaskPriority = Task['priority']

type TaskFormData = {
  title: string
  description: string
  priority: TaskPriority
  status: TaskStatus
  dueDate: string
  assignedTo: string
}

const blankForm = (): TaskFormData => ({
  title: '',
  description: '',
  priority: 'medium',
  status: 'pending',
  dueDate: new Date(Date.now() + 86400000).toISOString().substring(0, 10),
  assignedTo: '',
})

// ── Config ────────────────────────────────────────────────────────────────────
const COLUMNS: { id: TaskStatus; label: string; color: string; dot: string }[] = [
  { id: 'pending',     label: 'To Do',      color: 'border-t-slate-400',   dot: 'bg-slate-400' },
  { id: 'in-progress', label: 'In Progress', color: 'border-t-blue-500',    dot: 'bg-blue-500' },
  { id: 'completed',   label: 'Done',        color: 'border-t-emerald-500', dot: 'bg-emerald-500' },
  { id: 'cancelled',   label: 'Cancelled',   color: 'border-t-rose-500',    dot: 'bg-rose-500' },
]

const PRIORITY_DOT: Record<TaskPriority, string> = {
  low: 'bg-sky-400',
  medium: 'bg-amber-400',
  high: 'bg-rose-500',
}

const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: 'border-sky-500/30 text-sky-400',
  medium: 'border-amber-500/30 text-amber-400',
  high: 'border-rose-500/30 text-rose-400',
}

const STATUS_BADGE: Record<TaskStatus, string> = {
  'pending':     'border-slate-500/30 text-slate-400',
  'in-progress': 'border-blue-500/30 text-blue-400',
  'completed':   'border-emerald-500/30 text-emerald-400',
  'cancelled':   'border-rose-500/30 text-rose-400',
}

// ── Animation variants ────────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isOverdue(task: Task): boolean {
  if (task.status === 'completed' || task.status === 'cancelled') return false
  const due = new Date(task.dueDate)
  due.setHours(23, 59, 59, 999)
  return due < new Date()
}

// ── Sortable card (used inside board columns) ─────────────────────────────────
function SortableTaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange,
}: {
  task: Task
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <TaskCard task={task} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  )
}

// ── Plain task card (also used in DragOverlay) ────────────────────────────────
function TaskCard({
  task,
  onEdit,
  onDelete,
  onStatusChange,
  dragHandleProps,
}: {
  task: Task
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
  dragHandleProps?: Record<string, unknown>
}) {
  return (
    <div className="group rounded-xl border border-border bg-card p-3 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-2">
        {dragHandleProps && (
          <span
            {...dragHandleProps}
            className="mt-0.5 cursor-grab touch-none text-muted opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-medium leading-snug ${task.status === 'completed' ? 'line-through text-muted' : ''}`}>
            {task.title}
          </p>
          {task.description && (
            <p className="mt-1 text-xs text-muted line-clamp-2">{task.description}</p>
          )}
          {task.relatedTo && (
            <p className="mt-1 text-xs text-muted opacity-70">{task.relatedTo.type}: {task.relatedTo.name}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={`text-xs ${PRIORITY_BADGE[task.priority]}`}>
              {task.priority}
            </Badge>
            <span className="flex items-center gap-1 text-xs text-muted">
              <Calendar className="h-3 w-3" />
              {formatDate(task.dueDate)}
            </span>
            {isOverdue(task) && (
              <span className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-400">
                <AlertTriangle className="h-3 w-3" /> Overdue
              </span>
            )}
            {task.overdueReason && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300 max-w-[180px] truncate" title={task.overdueReason}>
                "{task.overdueReason}"
              </span>
            )}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onEdit(task)}>
              <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit
            </DropdownMenuItem>
            {COLUMNS.filter((c) => c.id !== task.status).map((col) => (
              <DropdownMenuItem key={col.id} onClick={() => onStatusChange(task.id, col.id)}>
                <span className={`mr-2 h-2 w-2 rounded-full inline-block ${col.dot}`} />
                Move to {col.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="text-error" onClick={() => onDelete(task.id)}>
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

// ── Drop column ───────────────────────────────────────────────────────────────
function BoardColumn({
  column,
  tasks,
  onEdit,
  onDelete,
  onStatusChange,
  isOver,
}: {
  column: (typeof COLUMNS)[number]
  tasks: Task[]
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
  onStatusChange: (id: string, status: TaskStatus) => void
  isOver: boolean
}) {
  // useDroppable makes the column itself a valid drop target,
  // which is essential when the column is empty (no sortable items).
  const { setNodeRef } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-xl border-t-4 ${column.color} border border-border bg-secondary/30 transition-colors ${isOver ? 'bg-primary/5 ring-2 ring-primary/20' : ''}`}
      style={{ minHeight: 400 }}
    >
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${column.dot}`} />
          <span className="text-sm font-semibold">{column.label}</span>
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-border px-1.5 text-xs font-medium">
            {tasks.length}
          </span>
        </div>
      </div>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 p-2 flex-1">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} onEdit={onEdit} onDelete={onDelete} onStatusChange={onStatusChange} />
          ))}
          {tasks.length === 0 && (
            <div className={`flex flex-1 items-center justify-center rounded-lg border-2 border-dashed py-10 text-xs text-muted transition-colors ${
              isOver ? 'border-primary/40 text-primary' : 'border-border opacity-50'
            }`}>
              Drop tasks here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export function TasksPage() {
  const { tasks, addTask, updateTask, deleteTask, users, currentUser } = useCRMStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'list' | 'board'>('board')

  // Drag state
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [overColumnId, setOverColumnId] = useState<TaskStatus | null>(null)

  // Form state
  const [formMode, setFormMode] = useState<'add' | 'edit' | null>(null)
  const [formData, setFormData] = useState<TaskFormData>(blankForm())
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [formError, setFormError] = useState('')

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // ── Overdue automation state ─────────────────────────────────────────────
  const [overdueAlertTasks, setOverdueAlertTasks] = useState<Task[]>([])
  const [adminBannerDismissed, setAdminBannerDismissed] = useState(false)
  // Queue of tasks owned by current user that need a reason
  const [reasonQueue, setReasonQueue] = useState<Task[]>([])
  const [reasonInput, setReasonInput] = useState('')
  const notifiedIds = useRef<Set<string>>(new Set())

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'manager'

  // ── Detect overdue tasks every 60 s ─────────────────────────────────────
  useEffect(() => {
    const check = () => {
      const now = new Date()
      const overdue = tasks.filter((t) => {
        if (t.status === 'completed' || t.status === 'cancelled') return false
        const due = new Date(t.dueDate)
        // treat end-of-due-date as midnight of next day
        due.setHours(23, 59, 59, 999)
        return due < now
      })

      // Mark newly detected overdue tasks in the store
      overdue.forEach((t) => {
        if (!notifiedIds.current.has(t.id)) {
          notifiedIds.current.add(t.id)
          updateTask(t.id, { overdueNotifiedAt: new Date().toISOString() })
        }
      })

      setOverdueAlertTasks(overdue)
      setAdminBannerDismissed(false)

      // Build reason-queue for the current user (tasks without a reason yet)
      if (currentUser) {
        const myOverdue = overdue.filter(
          (t) => t.assignedTo === currentUser.id && !t.overdueReason
        )
        setReasonQueue(myOverdue)
      }
    }

    check()
    const interval = setInterval(check, 60_000)
    return () => clearInterval(interval)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, currentUser])

  // ── Reason submission ────────────────────────────────────────────────────
  const submitReason = () => {
    const task = reasonQueue[0]
    if (!task || !reasonInput.trim()) return
    updateTask(task.id, { overdueReason: reasonInput.trim() })
    setReasonInput('')
    setReasonQueue((q) => q.slice(1))
  }

  const skipReason = () => {
    setReasonInput('')
    setReasonQueue((q) => q.slice(1))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  // ── Filtered tasks ──────────────────────────────────────────────────────────
  const filteredTasks = useMemo(
    () =>
      tasks.filter((t) => {
        const matchSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase())
        const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter
        return matchSearch && matchPriority
      }),
    [tasks, searchQuery, priorityFilter]
  )

  const tasksByColumn = useMemo(
    () =>
      COLUMNS.reduce<Record<TaskStatus, Task[]>>((acc, col) => {
        acc[col.id] = filteredTasks.filter((t) => t.status === col.id)
        return acc
      }, {} as Record<TaskStatus, Task[]>),
    [filteredTasks]
  )

  const activeTask = activeTaskId ? tasks.find((t) => t.id === activeTaskId) : null

  // ── DnD handlers ────────────────────────────────────────────────────────────
  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveTaskId(active.id as string)
  }

  const handleDragOver = ({ over }: DragOverEvent) => {
    if (!over) { setOverColumnId(null); return }
    // over.id might be a column id or a task id
    const colId = COLUMNS.find((c) => c.id === over.id)?.id
    if (colId) { setOverColumnId(colId); return }
    // it's a task id — find which column it belongs to
    const task = tasks.find((t) => t.id === over.id)
    if (task) setOverColumnId(task.status)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveTaskId(null)
    setOverColumnId(null)
    if (!over || !active) return

    const taskId = active.id as string
    const task = tasks.find((t) => t.id === taskId)
    if (!task) return

    // Check if dropped on a column header or inside a column (over a task)
    let newStatus: TaskStatus | null = null
    const colMatch = COLUMNS.find((c) => c.id === over.id)
    if (colMatch) {
      newStatus = colMatch.id
    } else {
      const overTask = tasks.find((t) => t.id === over.id)
      if (overTask) newStatus = overTask.status
    }

    if (newStatus && newStatus !== task.status) {
      updateTask(taskId, {
        status: newStatus,
        completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
      })
    }
  }

  // ── Form handlers ────────────────────────────────────────────────────────────
  const openAddForm = (defaultStatus: TaskStatus = 'pending') => {
    setFormData({ ...blankForm(), status: defaultStatus })
    setFormError('')
    setEditingTaskId(null)
    setFormMode('add')
  }

  const openEditForm = (task: Task) => {
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate.substring(0, 10),
      assignedTo: task.assignedTo || '',
    })
    setFormError('')
    setEditingTaskId(task.id)
    setFormMode('edit')
  }

  const submitForm = () => {
    if (!formData.title.trim()) { setFormError('Title is required.'); return }
    if (!formData.dueDate) { setFormError('Due date is required.'); return }

    if (formMode === 'add') {
      const newTask: Task = {
        id: `task-${Date.now()}`,
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        status: formData.status,
        priority: formData.priority,
        dueDate: formData.dueDate,
        assignedTo: formData.assignedTo || '1',
        createdAt: new Date().toISOString(),
      }
      addTask(newTask)
    } else if (editingTaskId) {
      updateTask(editingTaskId, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        status: formData.status,
        priority: formData.priority,
        dueDate: formData.dueDate,
        assignedTo: formData.assignedTo || '1',
        completedAt: formData.status === 'completed' ? new Date().toISOString() : undefined,
      })
    }
    setFormMode(null)
  }

  const handleToggleTask = (taskId: string, currentStatus: TaskStatus) => {
    const newStatus: TaskStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    updateTask(taskId, {
      status: newStatus,
      completedAt: newStatus === 'completed' ? new Date().toISOString() : undefined,
    })
  }

  const handleStatusChange = (id: string, status: TaskStatus) => {
    updateTask(id, {
      status,
      completedAt: status === 'completed' ? new Date().toISOString() : undefined,
    })
  }

  const confirmDelete = () => {
    if (deleteTarget) { deleteTask(deleteTarget); setDeleteTarget(null) }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

      {/* ── Admin overdue notification banner ─────────────────────────────── */}
      {isAdmin && overdueAlertTasks.length > 0 && !adminBannerDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-xl border border-rose-500/40 bg-rose-500/10 p-4"
        >
          <button
            onClick={() => setAdminBannerDismissed(true)}
            className="absolute right-3 top-3 text-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-3">
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-rose-400">
                {overdueAlertTasks.length} overdue task{overdueAlertTasks.length > 1 ? 's' : ''} require attention
              </p>
              <div className="mt-2 space-y-1.5">
                {overdueAlertTasks.map((t) => {
                  const assignee = users.find((u) => u.id === t.assignedTo)
                  return (
                    <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                      <span className="font-medium">{t.title}</span>
                      <span className="text-muted">·</span>
                      <span className="text-muted">Due {formatDate(t.dueDate)}</span>
                      <span className="text-muted">·</span>
                      <span className="text-muted">Assigned to <span className="text-foreground">{assignee?.name ?? 'Unassigned'}</span></span>
                      {t.overdueReason ? (
                        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">
                          Reason: {t.overdueReason}
                        </span>
                      ) : (
                        <span className="rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-300">
                          No reason provided
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Assigned-user reason dialog ────────────────────────────────────── */}
      <Dialog open={reasonQueue.length > 0} onOpenChange={() => {}}>
        <DialogContent className="max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
              Task Overdue — Action Required
            </DialogTitle>
            <DialogDescription>
              The task below has passed its due date and is still not completed. Please provide a reason.
            </DialogDescription>
          </DialogHeader>

          {reasonQueue[0] && (
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-secondary/40 p-3 space-y-1">
                <p className="font-semibold">{reasonQueue[0].title}</p>
                {reasonQueue[0].description && (
                  <p className="text-sm text-muted">{reasonQueue[0].description}</p>
                )}
                <p className="text-xs text-rose-400 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Due date: {formatDate(reasonQueue[0].dueDate)}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Why is this task still not completed? *</label>
                <textarea
                  value={reasonInput}
                  onChange={(e) => setReasonInput(e.target.value)}
                  rows={3}
                  placeholder="Explain the delay or blockers…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {reasonQueue.length > 1 && (
                <p className="text-xs text-muted">{reasonQueue.length - 1} more overdue task{reasonQueue.length > 2 ? 's' : ''} need a reason after this.</p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={skipReason}>Skip for now</Button>
            <Button
              disabled={!reasonInput.trim()}
              onClick={submitReason}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Submit reason
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-muted">Manage your daily tasks and activities</p>
        </div>
        <Button onClick={() => openAddForm()}>
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {COLUMNS.map((col) => (
          <Card key={col.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${col.dot}`} />
                <p className="text-2xl font-bold">{tasks.filter((t) => t.status === col.id).length}</p>
              </div>
              <p className="mt-1 text-sm text-muted">{col.label}</p>
            </CardContent>
          </Card>
        ))}
      </motion.div>

      {/* Filters + View toggle */}
      <motion.div variants={itemVariants} className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <Input
            placeholder="Search tasks..."
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
        {/* View toggle */}
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

      {/* ── BOARD VIEW ────────────────────────────────────────────────────── */}
      {viewMode === 'board' ? (
        <motion.div variants={itemVariants}>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {COLUMNS.map((col) => (
                <div key={col.id} id={col.id}>
                  <BoardColumn
                    column={col}
                    tasks={tasksByColumn[col.id]}
                    onEdit={openEditForm}
                    onDelete={(id) => setDeleteTarget(id)}
                    onStatusChange={handleStatusChange}
                    isOver={overColumnId === col.id}
                  />
                  <button
                    onClick={() => openAddForm(col.id)}
                    className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add task
                  </button>
                </div>
              ))}
            </div>

            {/* Drag overlay — renders the card while dragging */}
            <DragOverlay>
              {activeTask ? (
                <div className="rotate-2 scale-105 shadow-2xl">
                  <TaskCard
                    task={activeTask}
                    onEdit={() => {}}
                    onDelete={() => {}}
                    onStatusChange={() => {}}
                  />
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        </motion.div>
      ) : (
        /* ── LIST VIEW ────────────────────────────────────────────────────── */
        <motion.div variants={itemVariants}>
          <Card>
            <CardContent className="p-0">
              {filteredTasks.length === 0 ? (
                <div className="py-12 text-center text-sm text-muted">
                  No tasks match your filters.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredTasks.map((task) => (
                    <div
                      key={task.id}
                      className={`flex items-center gap-4 p-4 transition-colors hover:bg-secondary/50 ${task.status === 'completed' ? 'opacity-60' : ''}`}
                    >
                      <Checkbox
                        checked={task.status === 'completed'}
                        onCheckedChange={() => handleToggleTask(task.id, task.status)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${task.status === 'completed' ? 'line-through' : ''}`}>
                          {task.title}
                        </p>
                        {task.description && <p className="text-sm text-muted truncate">{task.description}</p>}
                        {task.relatedTo && (
                          <p className="text-xs text-muted opacity-70">{task.relatedTo.name}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3 text-sm">
                        <div className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority]}`} />
                        <span className="flex items-center gap-1 text-muted">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(task.dueDate)}
                        </span>
                        {isOverdue(task) && (
                          <span className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-xs text-rose-400">
                            <AlertTriangle className="h-3 w-3" /> Overdue
                          </span>
                        )}
                        <Badge variant="outline" className={STATUS_BADGE[task.status]}>
                          {task.status}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem onClick={() => openEditForm(task)}>
                              <Edit2 className="mr-2 h-3.5 w-3.5" /> Edit
                            </DropdownMenuItem>
                            {COLUMNS.filter((c) => c.id !== task.status).map((col) => (
                              <DropdownMenuItem key={col.id} onClick={() => handleStatusChange(task.id, col.id)}>
                                <span className={`mr-2 h-2 w-2 rounded-full inline-block ${col.dot}`} />
                                Move to {col.label}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuItem className="text-error" onClick={() => setDeleteTarget(task.id)}>
                              <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ── Add / Edit task dialog ─────────────────────────────────────────── */}
      <Dialog open={formMode !== null} onOpenChange={(open) => !open && setFormMode(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{formMode === 'add' ? 'Add new task' : 'Edit task'}</DialogTitle>
            <DialogDescription>
              {formMode === 'add' ? 'Create a new task and assign it to a column.' : 'Update the task details below.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Title *</label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData((f) => ({ ...f, title: e.target.value }))}
                placeholder="Task title"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                placeholder="Optional details…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">Priority</label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData((f) => ({ ...f, priority: e.target.value as TaskPriority }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Status / Column</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData((f) => ({ ...f, status: e.target.value as TaskStatus }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {COLUMNS.map((col) => (
                    <option key={col.id} value={col.id}>{col.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Due date *</label>
                <Input
                  type="date"
                  value={formData.dueDate}
                  onChange={(e) => setFormData((f) => ({ ...f, dueDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Assign to</label>
                <select
                  value={formData.assignedTo}
                  onChange={(e) => setFormData((f) => ({ ...f, assignedTo: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">— Unassigned —</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {formError && (
            <p className="rounded-md bg-error/10 p-2 text-sm text-error">{formError}</p>
          )}

          {/* Comments thread — only visible when editing an existing task */}
          {formMode === 'edit' && editingTaskId && (() => {
            const task = tasks.find(t => t.id === editingTaskId)
            return task ? (
              <div className="border-t border-border pt-4 space-y-2">
                <p className="text-sm font-semibold flex items-center gap-2">
                  Team Comments
                  {(task.comments?.length ?? 0) > 0 && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">{task.comments!.length}</span>
                  )}
                </p>
                <CommentThread
                  entityType="task"
                  entityId={task.id}
                  comments={task.comments ?? []}
                />
              </div>
            ) : null
          })()}

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormMode(null)}>Cancel</Button>
            <Button onClick={submitForm}>{formMode === 'add' ? 'Create task' : 'Save changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ─────────────────────────────────────────────────── */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete task?</DialogTitle>
            <DialogDescription>
              {(() => {
                const t = tasks.find((x) => x.id === deleteTarget)
                return `"${t?.title || 'This task'}" will be permanently deleted.`
              })()}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  )
}

