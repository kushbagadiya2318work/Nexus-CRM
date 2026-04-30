import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Sparkles, 
  TrendingUp, 
  AlertTriangle, 
  Lightbulb,
  Zap,
  MessageSquare,
  Mail,
  Phone,
  Calendar,
  ArrowRight,
  RefreshCw,
  Brain,
  Target,
  BookOpen,
  FileText,
  Video,
  Calculator,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Copy,
  CheckCircle2,
  HeartPulse,
  TrendingDown,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useCRMStore } from '@/store'
import type { Client, ContentAsset, ContentAssetType, ChurnRiskLevel, ChurnRiskSignal } from '@/types'

// ── Churn risk helpers ─────────────────────────────────────────────────────────
function _daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}

function computeClientChurnDetails(client: Client): { level: ChurnRiskLevel; score: number; signals: ChurnRiskSignal[] } {
  const signals: ChurnRiskSignal[] = []
  let riskScore = 0
  const hs = client.healthScore ?? 75
  if (hs < 40) { riskScore += 35; signals.push({ label: 'Critical health score', detail: `${hs}/100`, severity: 'critical' }) }
  else if (hs < 60) { riskScore += 20; signals.push({ label: 'Low health score', detail: `${hs}/100`, severity: 'warning' }) }
  else if (hs < 75) { riskScore += 8; signals.push({ label: 'Below-avg health', detail: `${hs}/100`, severity: 'info' }) }
  const daysIdle = _daysSince(client.lastContact)
  if (daysIdle > 60) { riskScore += 30; signals.push({ label: 'No contact 60+ days', detail: `${daysIdle}d ago`, severity: 'critical' }) }
  else if (daysIdle > 30) { riskScore += 18; signals.push({ label: 'No contact 30+ days', detail: `${daysIdle}d ago`, severity: 'warning' }) }
  else if (daysIdle > 14) { riskScore += 7; signals.push({ label: 'No contact 14+ days', detail: `${daysIdle}d ago`, severity: 'info' }) }
  if (client.renewalDate) {
    const daysLeft = Math.ceil((new Date(client.renewalDate).getTime() - Date.now()) / 86_400_000)
    if (daysLeft < 0) { riskScore += 25; signals.push({ label: 'Renewal overdue', detail: `${Math.abs(daysLeft)}d overdue`, severity: 'critical' }) }
    else if (daysLeft <= 30) { riskScore += 15; signals.push({ label: 'Renewal due soon', detail: `${daysLeft}d left`, severity: 'warning' }) }
    else if (daysLeft <= 60) { riskScore += 5; signals.push({ label: 'Renewal in 60d', detail: `${daysLeft}d left`, severity: 'info' }) }
  }
  if (client.status === 'churned') { riskScore += 40; signals.push({ label: 'Churned', detail: 'status=churned', severity: 'critical' }) }
  else if (client.status === 'inactive') { riskScore += 15; signals.push({ label: 'Inactive', detail: 'status=inactive', severity: 'warning' }) }
  const level: ChurnRiskLevel = riskScore >= 60 ? 'critical' : riskScore >= 35 ? 'high' : riskScore >= 15 ? 'medium' : 'low'
  return { level, score: Math.min(100, riskScore), signals }
}

function computeClientChurnLevel(client: Client): ChurnRiskLevel {
  return computeClientChurnDetails(client).level
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
}

// ── Content asset library (AI-curated) ─────────────────────────────────────────
const ASSET_LIBRARY: ContentAsset[] = [
  {
    id: 'ca-1',
    type: 'spec_sheet',
    title: 'NexusAI Technical Specification Sheet',
    description: 'Full API reference, integration guide, and security whitelist for enterprise IT teams.',
    tags: ['api', 'integration', 'enterprise', 'technical'],
    relevanceReason: 'TechCorp viewed API docs 12× and integration page 9× in the last 48 h.',
    url: '#',
  },
  {
    id: 'ca-2',
    type: 'case_study',
    title: 'How DataSync Increased Win Rate 38% with NexusAI',
    description: 'B2B SaaS company scaled from 200 to 800 leads/month while cutting response time by 60%.',
    tags: ['saas', 'win-rate', 'automation'],
    relevanceReason: 'Similar industry and team size to TechCorp (Series B, ~120 employees).',
    url: '#',
  },
  {
    id: 'ca-3',
    type: 'whitepaper',
    title: 'The AI-Driven CRM Playbook: 2025 Edition',
    description: 'Research-backed strategies for high-velocity sales teams using AI scoring and automation.',
    tags: ['ai', 'playbook', 'strategy'],
    relevanceReason: 'Matches TechCorp\'s expressed interest in AI-powered sales automation.',
    url: '#',
  },
  {
    id: 'ca-4',
    type: 'roi_calculator',
    title: 'NexusAI ROI Calculator — Enterprise Pack',
    description: 'Interactive model showing payback period based on team size, deal volume, and current conversion rate.',
    tags: ['roi', 'budget', 'enterprise'],
    relevanceReason: 'Budget concern flagged in call — shows $50k annual spend yields $380k+ revenue impact.',
    url: '#',
  },
  {
    id: 'ca-5',
    type: 'demo_video',
    title: '3-Minute Product Demo: AI Lead Scoring in Action',
    description: 'Screen-capture walkthrough of the scoring engine, workflow builder, and analytics dashboard.',
    tags: ['demo', 'product', 'ai'],
    relevanceReason: 'TechCorp viewed the features page 5× — a quick video closes information gaps.',
    url: '#',
  },
]

// Activity signals driving suggestions
const SIGNALS = [
  { page: 'Pricing page', count: 7, timeAgo: '1h ago' },
  { page: 'API Integration docs', count: 12, timeAgo: '4h ago' },
  { page: 'Enterprise Features overview', count: 9, timeAgo: '6h ago' },
  { page: 'Case Studies listing', count: 4, timeAgo: '12h ago' },
]

const ASSET_TYPE_META: Record<ContentAssetType, { label: string; icon: React.ReactNode; color: string; bg: string }> = {
  spec_sheet:     { label: 'Spec Sheet',      icon: <FileText className="h-4 w-4" />,    color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  case_study:     { label: 'Case Study',      icon: <BookOpen className="h-4 w-4" />,    color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  whitepaper:     { label: 'Whitepaper',      icon: <FileText className="h-4 w-4" />,    color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  demo_video:     { label: 'Demo Video',      icon: <Video className="h-4 w-4" />,       color: 'text-rose-400',    bg: 'bg-rose-500/10' },
  roi_calculator: { label: 'ROI Calculator',  icon: <Calculator className="h-4 w-4" />, color: 'text-amber-400',   bg: 'bg-amber-500/10' },
}

// Drafted email (AI-generated using signals)
const DRAFT_EMAIL = {
  subject: 'TechCorp × NexusAI — Resources Based on Your Recent Exploration',
  body: `Hi Sarah,

I noticed your team has been spending time on our integration docs and enterprise features — which tells me you're doing a serious evaluation. I wanted to make it as easy as possible.

Based on what caught your attention, I've put together a few resources specifically for TechCorp:

1. 📋 Technical Spec Sheet — Full API reference + HubSpot migration SLA (2 business days)
2. 📈 DataSync Case Study — They had a near-identical stack. 38% win-rate increase in 6 months.
3. 💰 ROI Calculator (pre-filled for your team size) — Shows $380k+ revenue impact at your scale, well within the $50k budget discussed.

Also, I'd love to set up a 30-minute technical deep-dive with our solutions engineer for your CTO — we can cover the integration architecture start-to-finish.

Would Tuesday at 2 PM work?

Best,
[Your name]`,
}

// ── Content Suggestions Panel ──────────────────────────────────────────────────
function ContentSuggestionsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copyEmail = () => {
    void navigator.clipboard.writeText(`Subject: ${DRAFT_EMAIL.subject}\n\n${DRAFT_EMAIL.body}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            AI-Generated Email + Content Bundle
          </DialogTitle>
          <DialogDescription>
            Personalised based on TechCorp Industries' recent activity signals across your site.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Activity signals driving this */}
          <div className="rounded-lg border border-orange-500/20 bg-orange-500/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-400 mb-3">⚡ Activity Signals Detected</p>
            <div className="grid grid-cols-2 gap-2">
              {SIGNALS.map((s) => (
                <div key={s.page} className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-xs">
                  <span className="text-muted">{s.page}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-orange-400 border-orange-500/30 text-xs py-0">{s.count}×</Badge>
                    <span className="text-muted">{s.timeAgo}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Draft email */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Drafted Email</p>
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={copyEmail}>
                {copied ? <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
              </Button>
            </div>
            <div className="rounded-lg border border-border bg-secondary/30 p-4 space-y-2">
              <p className="text-xs text-muted font-medium">Subject: <span className="text-foreground">{DRAFT_EMAIL.subject}</span></p>
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans text-muted">{DRAFT_EMAIL.body}</pre>
            </div>
          </div>

          {/* Suggested assets */}
          <div className="space-y-3">
            <p className="text-sm font-semibold">Suggested Attachments / Links</p>
            <div className="space-y-3">
              {ASSET_LIBRARY.map((asset) => {
                const meta = ASSET_TYPE_META[asset.type]
                return (
                  <div key={asset.id} className="flex items-start gap-3 rounded-lg border border-border p-3 hover:bg-secondary/50 transition-colors">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.color}`}>
                      {meta.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{asset.title}</p>
                        <Badge variant="outline" className={`${meta.color} text-xs shrink-0`}>{meta.label}</Badge>
                      </div>
                      <p className="text-xs text-muted mt-0.5">{asset.description}</p>
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> {asset.relevanceReason}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                      <ExternalLink className="h-3.5 w-3.5 text-muted" />
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function AIInsightsPage() {
  const { aiInsights, leads, clients } = useCRMStore()
  const [activeTab, setActiveTab] = useState('all')
  const [showDraftEmail, setShowDraftEmail] = useState(false)
  const [anomalyExpanded, setAnomalyExpanded] = useState(false)

  const filteredInsights = activeTab === 'all' 
    ? aiInsights 
    : aiInsights.filter(i => i.type === activeTab)

  // Generate additional AI insights
  const generatedInsights = [
    {
      id: 'gen-1',
      type: 'prediction',
      title: 'Revenue Forecast',
      description: 'Based on current pipeline velocity, projected revenue for Q1 2024 is $1.2M with 78% confidence.',
      metrics: [
        { label: 'Projected', value: '$1.2M' },
        { label: 'Confidence', value: '78%' },
        { label: 'At Risk', value: '$180K' },
      ],
      actionText: 'View Details',
    },
    {
      id: 'gen-2',
      type: 'recommendation',
      title: 'Optimal Contact Time',
      description: 'Analysis shows leads are 35% more likely to respond to emails sent on Tuesday mornings between 9-11 AM.',
      metrics: [
        { label: 'Best Day', value: 'Tuesday' },
        { label: 'Best Time', value: '9-11 AM' },
        { label: 'Response Rate', value: '+35%' },
      ],
      actionText: 'Schedule Campaign',
    },
    {
      id: 'gen-3',
      type: 'anomaly',
      title: 'Unusual Activity Detected',
      description: 'TechCorp Industries has shown 3x increase in product page views in the last 48 hours.',
      metrics: [
        { label: 'Page Views', value: '+215%' },
        { label: 'Last Active', value: '2h ago' },
        { label: 'Intent Score', value: '92/100' },
      ],
      actionText: 'View Activity',
    },
  ]

  const leadScores = leads.slice(0, 5).map(lead => ({
    name: lead.name,
    company: lead.company,
    score: lead.score,
    factors: [
      lead.score > 80 ? 'High engagement' : 'Moderate engagement',
      lead.source === 'referral' ? 'Warm referral' : 'Direct inquiry',
      'Decision maker identified',
    ],
  }))

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            AI Insights
          </h1>
          <p className="text-muted">AI-powered recommendations and predictions</p>
        </div>
        <Button variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh Insights
        </Button>
      </motion.div>

      {/* AI Overview Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Brain className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">156</p>
                <p className="text-sm text-muted">AI Predictions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10">
                <Target className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">87%</p>
                <p className="text-sm text-muted">Accuracy Rate</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Zap className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">42</p>
                <p className="text-sm text-muted">Auto-Actions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-500/10">
                <TrendingUp className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">+23%</p>
                <p className="text-sm text-muted">Conversion Lift</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI-Generated Insights */}
      <motion.div variants={itemVariants}>
        <h2 className="text-lg font-semibold mb-4">AI-Generated Insights</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {generatedInsights.map((insight) => (
            <Card key={insight.id} className={`border-l-4 ${insight.type === 'anomaly' ? 'border-l-orange-500' : 'border-l-primary'}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${
                    insight.type === 'prediction' ? 'bg-primary/10 text-primary' :
                    insight.type === 'recommendation' ? 'bg-emerald-500/10 text-emerald-500' :
                    'bg-orange-500/10 text-orange-500'
                  }`}>
                    {insight.type === 'prediction' ? <TrendingUp className="w-5 h-5" /> :
                     insight.type === 'recommendation' ? <Lightbulb className="w-5 h-5" /> :
                     <AlertTriangle className="w-5 h-5" />}
                  </div>
                  <div>
                    <h3 className="font-semibold">{insight.title}</h3>
                    <p className="text-sm text-muted mt-1">{insight.description}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {insight.metrics.map((metric) => (
                    <div key={metric.label} className="text-center p-2 bg-secondary rounded-lg">
                      <p className="text-lg font-bold">{metric.value}</p>
                      <p className="text-xs text-muted">{metric.label}</p>
                    </div>
                  ))}
                </div>

                {/* Anomaly card: show activity signals + content suggestions toggle */}
                {insight.type === 'anomaly' && (
                  <>
                    <AnimatePresence>
                      {anomalyExpanded && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden mb-3"
                        >
                          <div className="space-y-2 border-t border-border pt-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-orange-400">Pages Visited</p>
                            {SIGNALS.map(s => (
                              <div key={s.page} className="flex items-center justify-between text-xs rounded-md bg-secondary/50 px-3 py-1.5">
                                <span className="text-muted">{s.page}</span>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-orange-400 border-orange-500/30 text-xs py-0">{s.count}×</Badge>
                                  <span className="text-muted">{s.timeAgo}</span>
                                </div>
                              </div>
                            ))}
                            <p className="text-xs font-semibold uppercase tracking-wide text-primary mt-3">AI Suggested Assets</p>
                            {ASSET_LIBRARY.slice(0, 3).map(asset => {
                              const meta = ASSET_TYPE_META[asset.type]
                              return (
                                <div key={asset.id} className="flex items-center gap-2 rounded-md bg-secondary/50 px-3 py-2 text-xs">
                                  <span className={`${meta.color}`}>{meta.icon}</span>
                                  <span className="flex-1 truncate">{asset.title}</span>
                                  <Badge variant="outline" className={`${meta.color} border-current text-xs py-0`}>{meta.label}</Badge>
                                </div>
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="flex items-center gap-2">
                      <Button size="sm" className="flex-1 text-xs h-7" onClick={() => setShowDraftEmail(true)}>
                        <Mail className="h-3 w-3 mr-1" /> Draft Email + Assets
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAnomalyExpanded(v => !v)}>
                        {anomalyExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </>
                )}

                {insight.type !== 'anomaly' && (
                  <Button variant="link" className="p-0 h-auto">
                    {insight.actionText}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Lead Scoring */}
      <motion.div variants={itemVariants}>
        <Card>
          <CardHeader>
            <CardTitle>AI Lead Scoring</CardTitle>
            <CardDescription>Leads ranked by conversion probability</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {leadScores.map((lead, index) => (
                <div key={index} className="flex items-center gap-4 p-4 bg-secondary/50 rounded-lg">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-lg font-bold text-primary">{lead.score}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{lead.name}</p>
                    <p className="text-sm text-muted">{lead.company}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {lead.factors.map((factor, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {factor}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${
                      lead.score >= 80 ? 'text-emerald-500' :
                      lead.score >= 60 ? 'text-orange-500' :
                      'text-red-500'
                    }`}>
                      {lead.score >= 80 ? 'Hot' : lead.score >= 60 ? 'Warm' : 'Cold'}
                    </div>
                    <p className="text-xs text-muted">AI Rating</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Actionable Insights */}
      <motion.div variants={itemVariants}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Actionable Insights</h2>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="alert">Alerts</TabsTrigger>
              <TabsTrigger value="warning">Warnings</TabsTrigger>
              <TabsTrigger value="opportunity">Opportunities</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredInsights.map((insight) => (
            <Card key={insight.id} className="hover:shadow-elevated transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    insight.type === 'alert' ? 'bg-emerald-500/10 text-emerald-500' :
                    insight.type === 'warning' ? 'bg-orange-500/10 text-orange-500' :
                    'bg-blue-500/10 text-blue-500'
                  }`}>
                    {insight.type === 'alert' ? <Zap className="w-5 h-5" /> :
                     insight.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                     <Lightbulb className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">{insight.title}</h3>
                    <p className="text-sm text-muted mt-1">{insight.description}</p>
                    <Button variant="link" className="p-0 h-auto mt-2">
                      {insight.actionText}
                      <ArrowRight className="w-4 h-4 ml-1" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </motion.div>

      {/* Smart Actions */}
      <motion.div variants={itemVariants}>
        <h2 className="text-lg font-semibold mb-4">Smart Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="hover:shadow-elevated transition-shadow cursor-pointer border-primary/20 hover:border-primary/50" onClick={() => setShowDraftEmail(true)}>
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <h3 className="font-semibold">Draft Emails</h3>
              <p className="text-sm text-muted mt-1">AI + dynamic asset bundles</p>
              <Badge variant="outline" className="mt-2 text-xs text-primary border-primary/30">1 pending</Badge>
            </CardContent>
          </Card>
          <Card className="hover:shadow-elevated transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-3">
                <Phone className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="font-semibold">Call Priority</h3>
              <p className="text-sm text-muted mt-1">Ranked by AI score</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-elevated transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto mb-3">
                <Calendar className="w-6 h-6 text-purple-500" />
              </div>
              <h3 className="font-semibold">Smart Schedule</h3>
              <p className="text-sm text-muted mt-1">Optimal meeting times</p>
            </CardContent>
          </Card>
          <Card className="hover:shadow-elevated transition-shadow cursor-pointer">
            <CardContent className="p-4 text-center">
              <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="w-6 h-6 text-orange-500" />
              </div>
              <h3 className="font-semibold">Chat Assistant</h3>
              <p className="text-sm text-muted mt-1">Get AI recommendations</p>
            </CardContent>
          </Card>
        </div>
      </motion.div>

      <ContentSuggestionsPanel open={showDraftEmail} onClose={() => setShowDraftEmail(false)} />

      {/* ── Renewal & Churn Predictor ───────────────────────────────────────── */}
      <motion.div variants={itemVariants}>
        <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-rose-400" />
          Renewal &amp; Churn Predictor
        </h2>
        <p className="text-sm text-muted mb-4">AI monitors existing clients for activity drops, declining health scores, and upcoming renewals.</p>

        {/* Summary row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {(['critical','high','medium','low'] as ChurnRiskLevel[]).map((level) => {
            const count = clients.filter((c) => computeClientChurnLevel(c) === level).length
            const cfg: Record<ChurnRiskLevel, { bg: string; text: string; label: string }> = {
              critical: { bg: 'bg-red-600/15 border-red-600/30', text: 'text-red-300', label: 'Critical' },
              high:     { bg: 'bg-rose-500/15 border-rose-500/30', text: 'text-rose-300', label: 'High' },
              medium:   { bg: 'bg-amber-500/15 border-amber-500/30', text: 'text-amber-300', label: 'Medium' },
              low:      { bg: 'bg-emerald-500/15 border-emerald-500/30', text: 'text-emerald-300', label: 'Low' },
            }
            return (
              <div key={level} className={`rounded-xl border p-3 ${cfg[level].bg}`}>
                <p className={`text-2xl font-bold ${cfg[level].text}`}>{count}</p>
                <p className="text-xs text-muted">{cfg[level].label} Risk</p>
              </div>
            )
          })}
        </div>

        {/* At-risk client list */}
        {(() => {
          const atRisk = clients
            .map((c) => ({ client: c, ...computeClientChurnDetails(c) }))
            .filter((x) => x.level !== 'low')
            .sort((a, b) => b.score - a.score)
          if (atRisk.length === 0) return (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-center text-sm text-emerald-300">
              All clients have healthy engagement — no churn risk detected.
            </div>
          )
          return (
            <div className="space-y-3">
              {atRisk.map(({ client, level, score, signals }) => (
                <div key={client.id} className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                  <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    level === 'critical' ? 'bg-red-600/20' : level === 'high' ? 'bg-rose-500/20' : 'bg-amber-500/20'
                  }`}>
                    {level === 'critical' || level === 'high'
                      ? <TrendingDown className={`h-4 w-4 ${level === 'critical' ? 'text-red-400' : 'text-rose-400'}`} />
                      : <HeartPulse className="h-4 w-4 text-amber-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{client.company}</span>
                      <Badge variant="outline" className={`text-xs ${
                        level === 'critical' ? 'border-red-600/40 text-red-300 bg-red-600/10'
                        : level === 'high' ? 'border-rose-500/40 text-rose-300 bg-rose-500/10'
                        : 'border-amber-500/40 text-amber-300 bg-amber-500/10'
                      }`}>
                        {level.charAt(0).toUpperCase() + level.slice(1)} · {score}/100
                      </Badge>
                      {client.renewalDate && (
                        <span className="text-xs text-muted">Renews {new Date(client.renewalDate).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {signals.map((s, i) => (
                        <span key={i} className={`rounded-full px-2 py-0.5 text-xs ${
                          s.severity === 'critical' ? 'bg-red-600/20 text-red-300'
                          : s.severity === 'warning' ? 'bg-amber-500/20 text-amber-300'
                          : 'bg-slate-500/20 text-slate-300'
                        }`}>{s.label}: {s.detail}</span>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted">
                      Recommended: {level === 'critical' || level === 'high'
                        ? 'Urgent outreach — schedule a call or send a personalised renewal offer'
                        : 'Check-in email + share a relevant case study'}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <Phone className="h-3 w-3" /> Call
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}
      </motion.div>
    </motion.div>
  )
}
