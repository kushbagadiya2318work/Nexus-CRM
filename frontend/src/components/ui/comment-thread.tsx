/**
 * Reusable comment thread with @mention support.
 *
 * Usage:
 *   <CommentThread
 *     entityType="task"
 *     entityId={task.id}
 *     comments={task.comments ?? []}
 *   />
 */
import { useEffect, useRef, useState } from 'react'
import { AtSign, Send } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCRMStore } from '@/store'
import { formatRelativeTime, getInitials } from '@/lib/utils'
import type { Comment } from '@/types'

// ── MentionInput ───────────────────────────────────────────────────────────────
interface MentionInputProps {
  value: string
  onChange: (val: string) => void
  onSubmit: () => void
  placeholder?: string
}

export function MentionInput({ value, onChange, onSubmit, placeholder }: MentionInputProps) {
  const { users } = useCRMStore()
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(0)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const filtered = mentionQuery !== null
    ? users.filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : []

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value
    onChange(text)

    // Detect @ trigger
    const cursor = e.target.selectionStart ?? 0
    const textBefore = text.slice(0, cursor)
    const match = textBefore.match(/@(\w*)$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionStart(cursor - match[0].length)
      setHighlightIdx(0)
    } else {
      setMentionQuery(null)
    }
  }

  const insertMention = (userName: string) => {
    const before = value.slice(0, mentionStart)
    const after = value.slice(textareaRef.current?.selectionStart ?? mentionStart + (mentionQuery?.length ?? 0) + 1)
    const newVal = `${before}@${userName} ${after}`
    onChange(newVal)
    setMentionQuery(null)
    // Re-focus textarea
    setTimeout(() => {
      if (textareaRef.current) {
        const pos = (before + `@${userName} `).length
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery !== null && filtered.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        insertMention(filtered[highlightIdx].name)
        return
      }
      if (e.key === 'Escape') { setMentionQuery(null) }
    } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      onSubmit()
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        rows={2}
        placeholder={placeholder ?? 'Add a comment… type @ to mention someone (Ctrl+Enter to post)'}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
      />

      {/* Mention dropdown */}
      {mentionQuery !== null && filtered.length > 0 && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card shadow-xl">
          {filtered.map((user, i) => (
            <button
              key={user.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(user.name) }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${i === highlightIdx ? 'bg-primary/10 text-primary' : 'hover:bg-secondary'}`}
            >
              <Avatar className="h-5 w-5 shrink-0">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="text-[9px]">{getInitials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="font-medium">{user.name}</span>
              <span className="ml-auto text-xs text-muted capitalize">{user.role}</span>
            </button>
          ))}
          <div className="border-t border-border px-3 py-1.5">
            <p className="text-xs text-muted">↑↓ navigate · Enter to pick · Esc close</p>
          </div>
        </div>
      )}

      <div className="absolute bottom-2 right-2 flex items-center gap-1">
        <AtSign className="h-3.5 w-3.5 text-muted" />
        <span className="text-xs text-muted">mention</span>
      </div>
    </div>
  )
}

// ── CommentThread ──────────────────────────────────────────────────────────────
interface CommentThreadProps {
  entityType: 'task' | 'deal'
  entityId: string
  comments: Comment[]
  compact?: boolean
}

/** Renders typed @mentions as highlighted spans */
function renderBody(body: string) {
  const parts = body.split(/(@\w[\w\s]*(?= |$|@))/g)
  return parts.map((part, i) =>
    part.startsWith('@')
      ? <span key={i} className="rounded bg-primary/15 px-1 text-primary font-medium">{part}</span>
      : <span key={i}>{part}</span>
  )
}

export function CommentThread({ entityType, entityId, comments, compact = false }: CommentThreadProps) {
  const { currentUser, users, addComment } = useCRMStore()
  const [draft, setDraft] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [comments.length])

  const submit = () => {
    const body = draft.trim()
    if (!body || !currentUser) return

    // Extract @Name mentions → user IDs
    const mentionedNames = [...body.matchAll(/@([\w ]+?)(?= |$|@)/g)].map(m => m[1].trim())
    const mentions = users
      .filter(u => mentionedNames.some(n => u.name.toLowerCase() === n.toLowerCase()))
      .map(u => u.id)

    const comment: Comment = {
      id: `cmt-${Date.now()}`,
      authorId: currentUser.id,
      authorName: currentUser.name,
      body,
      mentions,
      createdAt: new Date().toISOString(),
    }

    addComment(entityType, entityId, comment)
    setDraft('')
  }

  return (
    <div className="space-y-3">
      {/* Thread */}
      {comments.length === 0 ? (
        !compact && (
          <p className="text-center text-xs text-muted py-3">
            No comments yet. Be the first — type <span className="text-primary font-medium">@name</span> to loop someone in.
          </p>
        )
      ) : (
        <div className={`space-y-2 ${compact ? 'max-h-40' : 'max-h-60'} overflow-y-auto pr-1`}>
          {comments.map(c => {
            const author = users.find(u => u.id === c.authorId)
            return (
              <div key={c.id} className="flex items-start gap-2">
                <Avatar className="h-6 w-6 shrink-0 mt-0.5">
                  <AvatarImage src={author?.avatar} />
                  <AvatarFallback className="text-[9px]">{getInitials(c.authorName)}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-xs font-semibold">{c.authorName}</span>
                    <span className="text-xs text-muted">{formatRelativeTime(c.createdAt)}</span>
                    {c.mentions.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        {c.mentions.map(uid => {
                          const u = users.find(x => x.id === uid)
                          return u ? (
                            <Badge key={uid} variant="outline" className="text-primary border-primary/30 text-xs py-0 px-1.5">
                              @{u.name.split(' ')[0]}
                            </Badge>
                          ) : null
                        })}
                        <span className="text-[10px] text-muted">notified</span>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted leading-snug mt-0.5">{renderBody(c.body)}</p>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="space-y-1.5">
        <MentionInput
          value={draft}
          onChange={setDraft}
          onSubmit={submit}
          placeholder="Comment… @mention to delegate (Ctrl+Enter to post)"
        />
        <div className="flex justify-end">
          <Button size="sm" className="h-7 gap-1 text-xs" onClick={submit} disabled={!draft.trim()}>
            <Send className="h-3 w-3" /> Post
          </Button>
        </div>
      </div>
    </div>
  )
}
