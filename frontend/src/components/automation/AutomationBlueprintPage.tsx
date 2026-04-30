import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { fetchAutomationBlueprint } from '@/lib/crm-api'
import { MessageCircle, Mail, Smartphone, Network, ShieldCheck, TestTube2, Workflow } from 'lucide-react'

interface BlueprintState {
  workflowDiagram: string[]
  toolStack: {
    free: Array<{ category: string; tools: string[] }>
    paid: Array<{ category: string; tools: string[] }>
  }
  sampleWorkflows: string[]
  messageExamples: {
    email: string
    sms: string
    whatsapp: string
  }
  bestPractices: string[]
}

const fallbackBlueprint: BlueprintState = {
  workflowDiagram: [
    '1. Capture inbound leads from forms, ads, LinkedIn, WhatsApp, and IVR.',
    '2. Validate consent, normalize fields, and deduplicate by phone/email.',
    '3. Score and segment leads, then assign them automatically.',
    '4. Trigger instant outreach and follow-up sequences.',
    '5. Alert sales, sync to downstream tools, and measure conversions.',
  ],
  toolStack: {
    free: [
      { category: 'Forms', tools: ['Google Forms', 'Typeform Free', 'Custom landing page'] },
      { category: 'Reporting', tools: ['Google Sheets', 'Looker Studio'] },
    ],
    paid: [
      { category: 'Messaging', tools: ['Twilio', 'WhatsApp Cloud API'] },
      { category: 'CRM', tools: ['HubSpot', 'Zoho CRM'] },
    ],
  },
  sampleWorkflows: [
    'Website form -> score -> assign -> welcome message -> notify sales.',
  ],
  messageExamples: {
    email: 'Hi {{name}}, thanks for contacting us. We would love to help.',
    sms: 'Thanks for reaching out. Reply with a good time to connect.',
    whatsapp: 'Thanks for your inquiry. A specialist will contact you shortly.',
  },
  bestPractices: [
    'Respond fast.',
    'Track consent.',
    'Test forms and first-touch messages.',
  ],
}

export function AutomationBlueprintPage() {
  const [blueprint, setBlueprint] = useState<BlueprintState>(fallbackBlueprint)

  useEffect(() => {
    let active = true

    fetchAutomationBlueprint().then((result) => {
      if (active && result?.data) {
        setBlueprint(result.data)
      }
    })

    return () => {
      active = false
    }
  }, [])

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Lead Automation Blueprint</h1>
        <p className="text-muted">Production workflow, tool stack, messaging, and optimization guidance for your lead generation engine.</p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-4 w-4 text-primary" />
            Step-by-step workflow diagram
          </CardTitle>
          <CardDescription>How data moves from capture to conversion and reporting.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {blueprint.workflowDiagram.map((step) => (
            <div key={step} className="rounded-xl border border-border bg-background/80 p-4 text-sm">
              {step}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Free Stack</CardTitle>
            <CardDescription>Low-cost setup for validation and early growth.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blueprint.toolStack.free.map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-sm font-medium">{group.category}</p>
                <div className="flex flex-wrap gap-2">
                  {group.tools.map((tool) => <Badge key={tool} variant="outline">{tool}</Badge>)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Paid Stack</CardTitle>
            <CardDescription>Recommended upgrades for production scale and reliability.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {blueprint.toolStack.paid.map((group) => (
              <div key={group.category}>
                <p className="mb-2 text-sm font-medium">{group.category}</p>
                <div className="flex flex-wrap gap-2">
                  {group.tools.map((tool) => <Badge key={tool} variant="outline">{tool}</Badge>)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-emerald-500" />
            Sample automation workflows
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {blueprint.sampleWorkflows.map((workflow) => (
            <div key={workflow} className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">{workflow}</div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Mail className="h-4 w-4 text-primary" />
              Email example
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-muted">{blueprint.messageExamples.email}</pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Smartphone className="h-4 w-4 text-amber-500" />
              SMS example
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-muted">{blueprint.messageExamples.sms}</pre>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              WhatsApp example
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-muted">{blueprint.messageExamples.whatsapp}</pre>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TestTube2 className="h-4 w-4 text-violet-500" />
              Conversion optimization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {blueprint.bestPractices.map((item) => (
              <div key={item} className="rounded-xl border border-border bg-secondary/30 p-4 text-sm">{item}</div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-cyan-500" />
              Compliance and security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="rounded-xl border border-border bg-secondary/30 p-4">Store consent timestamp, capture source, and opt-in choice for every public form submission.</div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">Keep PII in secure storage, use HTTPS-only deploys, and rotate provider tokens regularly.</div>
            <div className="rounded-xl border border-border bg-secondary/30 p-4">Only sync fields to Zapier/Make that downstream teams truly need, especially for GDPR-sensitive campaigns.</div>
          </CardContent>
        </Card>
      </div>
    </motion.div>
  )
}
