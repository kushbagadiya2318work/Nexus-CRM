/**
 * Browser Push Notification utilities for NexusAI CRM
 * Uses the Notifications API (no server/service-worker needed for same-tab alerts).
 * For true background push a service worker + VAPID server would be needed,
 * but the Notifications API fires even when the tab is in the background.
 */

export type NotificationPermission = 'default' | 'granted' | 'denied'

export interface CRMNotificationPayload {
  title: string
  body: string
  tag?: string      // deduplicates: same tag replaces previous notification
  icon?: string
  badge?: string
  data?: Record<string, unknown>
  onClick?: () => void
}

/** Request permission. Returns true if granted. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false

  const result = await Notification.requestPermission()
  return result === 'granted'
}

/** Current permission state */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) return 'denied'
  return Notification.permission as NotificationPermission
}

/** Fire a browser notification. Silently no-ops if permission is not granted. */
export function sendCRMNotification(payload: CRMNotificationPayload): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null

  const n = new Notification(payload.title, {
    body: payload.body,
    tag: payload.tag,
    icon: payload.icon ?? '/favicon.ico',
    badge: payload.badge,
    data: payload.data,
    // vibrate not supported in ts lib but works in Chrome mobile
  })

  if (payload.onClick) {
    n.onclick = () => {
      window.focus()
      payload.onClick!()
    }
  }

  return n
}

// ── Pre-built alert helpers ────────────────────────────────────────────────────

export function notifyHighValueChurn(clientName: string, riskValue: number, navigate?: () => void) {
  sendCRMNotification({
    title: '🚨 Churn Risk Detected',
    body: `${clientName} — $${(riskValue / 1000).toFixed(0)}K account is at critical churn risk.`,
    tag: `churn-${clientName}`,
    data: { type: 'churn' },
    onClick: navigate,
  })
}

export function notifyUnusualDealActivity(dealName: string, message: string, navigate?: () => void) {
  sendCRMNotification({
    title: '⚡ Unusual Deal Activity',
    body: `${dealName}: ${message}`,
    tag: `deal-activity-${dealName}`,
    data: { type: 'deal_activity' },
    onClick: navigate,
  })
}

export function notifyLeadConverted(leadName: string, dealValue: number) {
  sendCRMNotification({
    title: '✅ Lead Converted',
    body: `${leadName} converted to a $${(dealValue / 1000).toFixed(0)}K deal.`,
    tag: `conversion-${leadName}`,
    data: { type: 'conversion' },
  })
}

export function notifyHighScoreLead(leadName: string, score: number, company: string) {
  sendCRMNotification({
    title: '🔥 High-Score Lead Alert',
    body: `${leadName} from ${company} just hit a score of ${score} — act now.`,
    tag: `hot-lead-${leadName}`,
    data: { type: 'hot_lead' },
  })
}
