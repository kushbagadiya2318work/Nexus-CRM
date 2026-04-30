import type { Lead, LeadSource, LeadStatus, LeadTimelineEntry, User } from '@/types'

interface ContactTarget {
  name: string
  phone?: string
}

export const leadStatusOptions: LeadStatus[] = [
  'new',
  'contacted',
  'interested',
  'not_interested',
  'converted',
]

export const leadSourceOptions: LeadSource[] = [
  'manual',
  'meta_ads',
  'api',
  'whatsapp',
  'ivr',
  'website',
  'referral',
  'linkedin',
  'email',
  'event',
  'other',
]

export const statusLabels: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  interested: 'Interested',
  not_interested: 'Not Interested',
  converted: 'Converted',
  qualified: 'Qualified',
  proposal: 'Proposal',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
}

export const statusStyles: Record<string, string> = {
  new: 'bg-sky-500/10 text-sky-500 border-sky-500/20',
  contacted: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20',
  interested: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  not_interested: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  converted: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  qualified: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  proposal: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  negotiation: 'bg-pink-500/10 text-pink-500 border-pink-500/20',
  won: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  lost: 'bg-red-500/10 text-red-500 border-red-500/20',
}

export const sourceLabels: Record<string, string> = {
  manual: 'Manual',
  meta_ads: 'Meta Ads',
  api: 'Public API',
  whatsapp: 'WhatsApp',
  ivr: 'IVR',
  website: 'Website',
  referral: 'Referral',
  linkedin: 'LinkedIn',
  email: 'Email',
  event: 'Event',
  other: 'Other',
}

export const sourceStyles: Record<string, string> = {
  manual: 'bg-slate-500',
  meta_ads: 'bg-blue-500',
  api: 'bg-violet-500',
  whatsapp: 'bg-emerald-500',
  ivr: 'bg-amber-500',
  website: 'bg-cyan-500',
  referral: 'bg-lime-500',
  linkedin: 'bg-indigo-500',
  email: 'bg-orange-500',
  event: 'bg-pink-500',
  other: 'bg-gray-500',
}

export function getAssignedUserName(lead: Lead, users: User[]): string {
  return lead.assignedUserName || users.find((user) => user.id === lead.assignedTo)?.name || 'Unassigned'
}

export function getLeadTimeline(lead: Lead, users: User[]): LeadTimelineEntry[] {
  const owner = getAssignedUserName(lead, users)
  const derivedEvents: LeadTimelineEntry[] = [
    {
      id: `${lead.id}-created`,
      type: 'system',
      title: 'Lead captured',
      description: `${lead.name} was added from ${sourceLabels[lead.source] || 'CRM'} and auto-assigned to ${owner}.`,
      timestamp: lead.createdAt,
    },
  ]

  if (lead.lastContacted) {
    derivedEvents.push({
      id: `${lead.id}-contacted`,
      type: lead.lastContactChannel === 'whatsapp' ? 'message' : 'call',
      title: 'Latest contact',
      description: `Most recent outreach happened ${lead.lastContactChannel || 'call'} via the CRM workspace.`,
      timestamp: lead.lastContacted,
    })
  }

  if (lead.notes) {
    derivedEvents.push({
      id: `${lead.id}-note`,
      type: 'note',
      title: 'Sales note added',
      description: lead.notes,
      timestamp: lead.lastActivity || lead.createdAt,
    })
  }

  derivedEvents.push({
    id: `${lead.id}-status`,
    type: 'status',
    title: 'Stage updated',
    description: `Lead is currently marked as ${statusLabels[lead.status] || lead.status}.`,
    timestamp: lead.lastActivity || lead.createdAt,
  })

  return [...(lead.timeline || []), ...derivedEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
}

export function buildWhatsAppUrl(
  contact: ContactTarget,
  template = 'Hi {{name}}, thanks for your interest in Nexus CRM. Our team will contact you shortly.'
): string {
  const phone = (contact.phone || '').replace(/\D/g, '')

  if (!phone) {
    return '#'
  }

  const text = encodeURIComponent(template.replace('{{name}}', contact.name))
  return `https://wa.me/${phone}?text=${text}`
}
