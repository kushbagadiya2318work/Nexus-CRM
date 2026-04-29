import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  BadgeDollarSign,
  Check,
  ChevronDown,
  Clock,
  Copy,
  FileSignature,
  FileText,
  Paperclip,
  Percent,
  Plus,
  Printer,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useCRMStore } from '@/store'
import type { Deal, Quote, QuoteLineItem, QuoteStatus } from '@/types'

// ── helpers ────────────────────────────────────────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 10)
}

function calcLineTotal(item: QuoteLineItem): number {
  return item.quantity * item.unitPrice * (1 - item.discount / 100)
}

function recalcTotals(
  items: QuoteLineItem[],
  globalDiscount: number,
  taxRate: number,
): Pick<Quote, 'subtotal' | 'discountAmount' | 'taxAmount' | 'total'> {
  const subtotal = items.reduce((s, i) => s + calcLineTotal(i), 0)
  const discountAmount = subtotal * (globalDiscount / 100)
  const afterDiscount = subtotal - discountAmount
  const taxAmount = afterDiscount * (taxRate / 100)
  const total = afterDiscount + taxAmount
  return { subtotal, discountAmount, taxAmount, total }
}

const STATUS_BADGE: Record<QuoteStatus, string> = {
  draft:    'border-slate-500/40 text-slate-400',
  sent:     'border-blue-500/40 text-blue-400',
  accepted: 'border-emerald-500/40 text-emerald-400',
  rejected: 'border-rose-500/40 text-rose-400',
  expired:  'border-amber-500/40 text-amber-400',
}

const STATUS_LABELS: Record<QuoteStatus, string> = {
  draft: 'Draft', sent: 'Sent', accepted: 'Accepted', rejected: 'Rejected', expired: 'Expired',
}

const fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

// ── Line-item row ──────────────────────────────────────────────────────────────
function LineRow({
  item,
  onChange,
  onRemove,
}: {
  item: QuoteLineItem
  onChange: (updated: QuoteLineItem) => void
  onRemove: () => void
}) {
  const update = (field: keyof QuoteLineItem, raw: string) => {
    const num = parseFloat(raw) || 0
    const next = { ...item, [field]: num }
    next.total = calcLineTotal(next)
    onChange(next)
  }

  return (
    <div className="grid grid-cols-[1fr_80px_100px_80px_90px_32px] gap-1.5 items-center text-sm">
      <Input
        value={item.description}
        onChange={(e) => onChange({ ...item, description: e.target.value, total: calcLineTotal(item) })}
        placeholder="Line item description"
        className="h-8 text-xs"
      />
      <Input
        type="number"
        min={1}
        value={item.quantity}
        onChange={(e) => update('quantity', e.target.value)}
        placeholder="Qty"
        className="h-8 text-xs text-right"
      />
      <Input
        type="number"
        min={0}
        value={item.unitPrice}
        onChange={(e) => update('unitPrice', e.target.value)}
        placeholder="Unit price"
        className="h-8 text-xs text-right"
      />
      <div className="relative">
        <Input
          type="number"
          min={0}
          max={100}
          value={item.discount}
          onChange={(e) => update('discount', e.target.value)}
          placeholder="0"
          className="h-8 text-xs text-right pr-6"
        />
        <Percent className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
      </div>
      <p className="text-right font-medium text-emerald-400">{fmt.format(calcLineTotal(item))}</p>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-400 hover:text-rose-300" onClick={onRemove}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function QuoteBuilder({
  deal,
  open,
  onClose,
}: {
  deal: Deal
  open: boolean
  onClose: () => void
}) {
  const { quotes, addQuote, updateQuote, currentUser } = useCRMStore()

  // Find existing quote for this deal (latest)
  const existing = quotes.filter((q) => q.dealId === deal.id).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0]

  const [items, setItems] = useState<QuoteLineItem[]>([])
  const [globalDiscount, setGlobalDiscount] = useState(0)
  const [taxRate, setTaxRate] = useState(10)
  const [validUntil, setValidUntil] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
  )
  const [paymentTerms, setPaymentTerms] = useState('Net 30')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<QuoteStatus>('draft')
  const [saved, setSaved] = useState(false)
  const [tab, setTab] = useState<'build' | 'preview'>('build')
  const [copied, setCopied] = useState(false)
  const quoteIdRef = useRef(existing?.id ?? uid())

  // Initialise from existing quote or seed from deal value
  useEffect(() => {
    if (!open) return
    if (existing) {
      setItems(existing.lineItems)
      setGlobalDiscount(existing.globalDiscount)
      setTaxRate(existing.taxRate)
      setValidUntil(existing.validUntil.substring(0, 10))
      setPaymentTerms(existing.paymentTerms)
      setNotes(existing.notes)
      setStatus(existing.status)
      quoteIdRef.current = existing.id
    } else {
      setItems([
        { id: uid(), description: deal.name, quantity: 1, unitPrice: deal.value, discount: 0, total: deal.value },
      ])
      setGlobalDiscount(0)
      setTaxRate(10)
      setValidUntil(new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10))
      setPaymentTerms('Net 30')
      setNotes('')
      setStatus('draft')
      quoteIdRef.current = uid()
    }
    setSaved(false)
  }, [open, existing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = recalcTotals(items, globalDiscount, taxRate)
  const quoteNumber = existing?.quoteNumber ?? `Q-${new Date().getFullYear()}-${quoteIdRef.current.substring(0, 4).toUpperCase()}`

  function addItem() {
    setItems((prev) => [
      ...prev,
      { id: uid(), description: '', quantity: 1, unitPrice: 0, discount: 0, total: 0 },
    ])
  }

  function saveQuote(nextStatus?: QuoteStatus) {
    const s = nextStatus ?? status
    const payload: Quote = {
      id: quoteIdRef.current,
      dealId: deal.id,
      dealName: deal.name,
      clientId: deal.clientId,
      clientName: deal.clientName,
      quoteNumber,
      status: s,
      lineItems: items,
      globalDiscount,
      taxRate,
      ...totals,
      currency: 'USD',
      validUntil,
      paymentTerms,
      notes,
      signatureRequired: true,
      createdBy: currentUser?.name ?? 'Rep',
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    if (existing) {
      updateQuote(existing.id, payload)
    } else {
      addQuote(payload)
    }
    setStatus(s)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function handleSend() {
    saveQuote('sent')
  }

  async function handleCopy() {
    const text = [
      `QUOTE: ${quoteNumber}`,
      `Client: ${deal.clientName}`,
      `Deal: ${deal.name}`,
      `Valid until: ${validUntil}`,
      `Payment terms: ${paymentTerms}`,
      '',
      'LINE ITEMS',
      ...items.map((i) => `  ${i.description}  x${i.quantity}  @${fmt.format(i.unitPrice)}${i.discount > 0 ? `  -${i.discount}%` : ''}  = ${fmt.format(calcLineTotal(i))}`),
      '',
      `Subtotal: ${fmt.format(totals.subtotal)}`,
      globalDiscount > 0 ? `Discount (${globalDiscount}%): -${fmt.format(totals.discountAmount)}` : '',
      `Tax (${taxRate}%): ${fmt.format(totals.taxAmount)}`,
      `TOTAL: ${fmt.format(totals.total)}`,
      notes ? `\nNotes: ${notes}` : '',
    ].filter(Boolean).join('\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileSignature className="h-4 w-4 text-primary" />
                CPQ — Quote Builder
              </DialogTitle>
              <p className="text-xs text-muted mt-0.5">{quoteNumber} · {deal.clientName}</p>
            </div>
            <Badge variant="outline" className={`text-xs ${STATUS_BADGE[status]}`}>
              {STATUS_LABELS[status]}
            </Badge>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'build' | 'preview')}>
          <TabsList className="mb-4">
            <TabsTrigger value="build"><FileText className="h-3.5 w-3.5 mr-1" />Build</TabsTrigger>
            <TabsTrigger value="preview"><Printer className="h-3.5 w-3.5 mr-1" />Preview</TabsTrigger>
          </TabsList>

          {tab === 'build' && (
            <div className="space-y-5">
              {/* Line items header */}
              <div>
                <div className="grid grid-cols-[1fr_80px_100px_80px_90px_32px] gap-1.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted px-0.5">
                  <span>Description</span>
                  <span className="text-right">Qty</span>
                  <span className="text-right">Unit Price</span>
                  <span className="text-right">Disc %</span>
                  <span className="text-right">Total</span>
                  <span />
                </div>
                <div className="space-y-1.5">
                  {items.map((item) => (
                    <LineRow
                      key={item.id}
                      item={item}
                      onChange={(updated) => setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))}
                      onRemove={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
                    />
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="mt-2 h-7 text-xs gap-1 text-primary" onClick={addItem}>
                  <Plus className="h-3.5 w-3.5" /> Add line item
                </Button>
              </div>

              {/* Pricing controls */}
              <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex-1 min-w-[120px]">
                  <label className="text-xs text-muted block mb-1">Global Discount %</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={globalDiscount}
                    onChange={(e) => setGlobalDiscount(parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <label className="text-xs text-muted block mb-1">Tax Rate %</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={taxRate}
                    onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted block mb-1">Valid Until</label>
                  <Input
                    type="date"
                    value={validUntil}
                    onChange={(e) => setValidUntil(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="text-xs text-muted block mb-1">Payment Terms</label>
                  <Input
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    placeholder="Net 30"
                    className="h-8 text-sm"
                  />
                </div>
              </div>

              {/* Totals */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted">
                  <span>Subtotal</span>
                  <span>{fmt.format(totals.subtotal)}</span>
                </div>
                {globalDiscount > 0 && (
                  <div className="flex justify-between text-amber-400">
                    <span>Discount ({globalDiscount}%)</span>
                    <span>-{fmt.format(totals.discountAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-muted">
                  <span>Tax ({taxRate}%)</span>
                  <span>{fmt.format(totals.taxAmount)}</span>
                </div>
                <div className="flex justify-between font-bold text-base text-emerald-400 border-t border-border pt-2 mt-2">
                  <span>Total</span>
                  <span>{fmt.format(totals.total)}</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs text-muted block mb-1">Internal Notes / Terms</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Additional terms, conditions, or notes for the client..."
                  className="w-full rounded-lg border border-border bg-secondary/30 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary placeholder:text-muted-foreground"
                />
              </div>
            </div>
          )}

          {tab === 'preview' && (
            <div className="rounded-xl border border-border bg-white text-gray-900 p-6 space-y-5 font-sans text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-lg font-bold text-gray-900">NexusAI CRM</p>
                  <p className="text-xs text-gray-500">nexus.ai · sales@nexus.ai</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700">{quoteNumber}</p>
                  <p className="text-xs text-gray-500">Valid until {validUntil}</p>
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${status === 'accepted' ? 'bg-green-100 text-green-700' : status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                    {STATUS_LABELS[status]}
                  </span>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Bill To</p>
                <p className="font-semibold">{deal.clientName}</p>
                <p className="text-xs text-gray-500">{deal.name}</p>
              </div>

              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-gray-500">
                    <th className="py-2 pr-2 font-semibold">Description</th>
                    <th className="py-2 pr-2 text-right font-semibold">Qty</th>
                    <th className="py-2 pr-2 text-right font-semibold">Unit Price</th>
                    <th className="py-2 pr-2 text-right font-semibold">Disc</th>
                    <th className="py-2 text-right font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2">{item.description || '—'}</td>
                      <td className="py-2 pr-2 text-right">{item.quantity}</td>
                      <td className="py-2 pr-2 text-right">{fmt.format(item.unitPrice)}</td>
                      <td className="py-2 pr-2 text-right">{item.discount > 0 ? `${item.discount}%` : '—'}</td>
                      <td className="py-2 text-right font-medium">{fmt.format(calcLineTotal(item))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="flex justify-end">
                <div className="w-56 space-y-1 text-xs">
                  <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>{fmt.format(totals.subtotal)}</span></div>
                  {globalDiscount > 0 && <div className="flex justify-between text-amber-600"><span>Discount ({globalDiscount}%)</span><span>-{fmt.format(totals.discountAmount)}</span></div>}
                  <div className="flex justify-between text-gray-500"><span>Tax ({taxRate}%)</span><span>{fmt.format(totals.taxAmount)}</span></div>
                  <div className="flex justify-between text-sm font-bold border-t border-gray-300 pt-1 text-gray-900"><span>Total</span><span>{fmt.format(totals.total)}</span></div>
                </div>
              </div>

              {paymentTerms && (
                <p className="text-xs text-gray-500">Payment Terms: <span className="font-medium text-gray-700">{paymentTerms}</span></p>
              )}
              {notes && <p className="text-xs text-gray-500 italic">{notes}</p>}

              <div className="border-t border-gray-200 pt-4 flex items-center gap-4">
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-4">Client Signature</p>
                  <div className="border-b border-gray-400 w-48" />
                  <p className="text-xs text-gray-400 mt-0.5">Signature · Date</p>
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-500 mb-4">Authorized by NexusAI</p>
                  <div className="border-b border-gray-400 w-48" />
                  <p className="text-xs text-gray-400 mt-0.5">{currentUser?.name ?? 'Rep'} · {new Date().toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          )}
        </Tabs>

        <DialogFooter className="flex-wrap gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied!' : 'Copy Quote'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => saveQuote()} className="gap-1.5">
            {saved ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Paperclip className="h-3.5 w-3.5" />}
            {saved ? 'Saved' : 'Save Draft'}
          </Button>
          <Button size="sm" onClick={handleSend} className="gap-1.5 bg-primary text-primary-foreground">
            <Send className="h-3.5 w-3.5" /> Send to Client
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
