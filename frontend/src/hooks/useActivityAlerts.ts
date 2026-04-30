/**
 * useActivityAlerts
 *
 * Watches the CRM store for unusual activity and fires browser push notifications:
 * - Critical churn risk clients with high lifetime value
 * - Deals stuck in negotiation for too long with large value
 * - High-score new leads (score >= 90) that haven't been contacted
 *
 * Includes a deduplication guard so each alert fires at most once per session.
 */

import { useEffect, useRef } from 'react'
import { useCRMStore } from '@/store'
import {
  getNotificationPermission,
  notifyHighValueChurn,
  notifyUnusualDealActivity,
  notifyHighScoreLead,
} from '@/lib/push-notifications'

const CHURN_VALUE_THRESHOLD = 50_000   // notify if LTV >= $50K
const HOT_LEAD_SCORE_THRESHOLD = 88

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

export function useActivityAlerts() {
  const { clients, deals, leads } = useCRMStore()
  // Track which alert IDs have already been fired this session
  const firedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (getNotificationPermission() !== 'granted') return

    const fired = firedRef.current

    // ── Churn risk alerts ───────────────────────────────────────────────────
    for (const client of clients) {
      if (client.status === 'churned') continue
      const ltv = client.lifetimeValue ?? 0
      if (ltv < CHURN_VALUE_THRESHOLD) continue

      const health = client.healthScore ?? 100
      const daysSinceContact = daysSince(client.lastContact)

      // Critical: health below 40 OR no contact in 60+ days on a high-value account
      const isCritical = health < 40 || daysSinceContact > 60
      if (!isCritical) continue

      const key = `churn-${client.id}`
      if (fired.has(key)) continue
      fired.add(key)

      notifyHighValueChurn(client.name, ltv, () => {
        window.location.hash = '/clients'
      })
    }

    // ── Stuck high-value deal alerts ────────────────────────────────────────
    for (const deal of deals) {
      if (deal.stage === 'closed-won' || deal.stage === 'closed-lost') continue
      if (deal.value < 100_000) continue

      const stuckDays = daysSince(deal.stageMovedAt ?? deal.updatedAt ?? deal.createdAt)
      if (stuckDays < 15) continue

      const key = `stuck-deal-${deal.id}`
      if (fired.has(key)) continue
      fired.add(key)

      notifyUnusualDealActivity(
        deal.name,
        `Stuck in "${deal.stage}" for ${stuckDays} days — $${(deal.value / 1000).toFixed(0)}K at risk.`,
        () => { window.location.hash = '/deals' }
      )
    }

    // ── Hot new lead alerts ─────────────────────────────────────────────────
    for (const lead of leads) {
      if (lead.status !== 'new') continue
      if ((lead.score ?? 0) < HOT_LEAD_SCORE_THRESHOLD) continue

      const key = `hot-lead-${lead.id}`
      if (fired.has(key)) continue
      fired.add(key)

      notifyHighScoreLead(lead.name, lead.score, lead.company)
    }
  }, [clients, deals, leads])
}
