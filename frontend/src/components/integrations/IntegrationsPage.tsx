import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Link2, MessageCircle, Phone, Save, Webhook, Radio } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fetchIntegrationStatus } from '@/lib/crm-api'

const storageKey = 'crm-integrations-config'

export function IntegrationsPage() {
  const [metaAccessToken, setMetaAccessToken] = useState('')
  const [metaPageId, setMetaPageId] = useState('')
  const [metaVerifyToken, setMetaVerifyToken] = useState('')
  const [statusMessage, setStatusMessage] = useState('Fill in your Meta credentials and save them for local setup.')
  const [integrationStatus, setIntegrationStatus] = useState({
    metaAds: false,
    whatsapp: false,
    sms: false,
    email: false,
    slack: false,
    sync: false,
    calling: false,
  })

  useEffect(() => {
    const saved = window.localStorage.getItem(storageKey)
    if (saved) {
      const parsed = JSON.parse(saved)
      setMetaAccessToken(parsed.metaAccessToken || '')
      setMetaPageId(parsed.metaPageId || '')
      setMetaVerifyToken(parsed.metaVerifyToken || '')
    }

    fetchIntegrationStatus().then((result) => {
      if (result?.data) {
        setIntegrationStatus(result.data as typeof integrationStatus)
      }
    })
  }, [])

  const saveMetaConfig = () => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({ metaAccessToken, metaPageId, metaVerifyToken })
    )
    setStatusMessage('Meta Ads account settings saved locally. Add the same values to the backend env file to activate webhooks.')
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Integrations</h1>
        <p className="text-muted">Connect Meta Ads, WhatsApp, and your calling provider from one place.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-7">
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <p className="font-medium">Meta Ads</p>
            </div>
            <p className="text-sm text-muted">{integrationStatus.metaAds ? 'Connected in backend' : 'Awaiting backend credentials'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              <p className="font-medium">WhatsApp</p>
            </div>
            <p className="text-sm text-muted">{integrationStatus.whatsapp ? 'Connected in backend' : 'Awaiting backend credentials'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Phone className="h-4 w-4 text-amber-500" />
              <p className="font-medium">Calling API</p>
            </div>
            <p className="text-sm text-muted">{integrationStatus.calling ? 'Connected in backend' : 'Awaiting backend credentials'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Radio className="h-4 w-4 text-emerald-500" />
              <p className="font-medium">SMS</p>
            </div>
            <p className="text-sm text-muted">{integrationStatus.sms ? 'Connected in backend' : 'Awaiting backend credentials'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Webhook className="h-4 w-4 text-cyan-500" />
              <p className="font-medium">Email</p>
            </div>
            <p className="text-sm text-muted">{integrationStatus.email ? 'Connected in backend' : 'Awaiting backend credentials'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-violet-500" />
              <p className="font-medium">Slack</p>
            </div>
            <p className="text-sm text-muted">{integrationStatus.slack ? 'Connected in backend' : 'Awaiting webhook URL'}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              <p className="font-medium">Zapier/Make</p>
            </div>
            <p className="text-sm text-muted">{integrationStatus.sync ? 'Realtime sync enabled' : 'No outbound sync webhook yet'}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Production connection checklist</CardTitle>
          <CardDescription>Use these environment-backed integrations for real lead automation.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>`MONGO_URI` stores persistent leads, follow-up history, and analytics data.</p>
          <p>`WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` enable instant replies and follow-ups.</p>
          <p>`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER` enable SMS and call workflows.</p>
          <p>`LEAD_EMAIL_WEBHOOK_URL` powers transactional lead-response emails through your preferred provider.</p>
          <p>`SLACK_WEBHOOK_URL` sends hot-lead alerts to the sales team.</p>
          <p>`ZAPIER_WEBHOOK_URL` or `MAKE_WEBHOOK_URL` keeps downstream tools in sync in real time.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-emerald-500" />
            WhatsApp and IVR auto-capture
          </CardTitle>
          <CardDescription>
            These webhook URLs automatically create or update leads without manual entry.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted">
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="font-medium text-foreground">Webhook endpoints</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>WhatsApp: http://localhost:4000/api/webhooks/whatsapp</li>
              <li>IVR/Calling: http://localhost:4000/api/webhooks/ivr</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border bg-secondary/40 p-4">
            <p className="font-medium text-foreground">Behavior</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>If the phone number already exists, the activity is attached to that lead.</li>
              <li>If the number is new, the CRM creates the lead automatically.</li>
              <li>The lead is assigned by smart routing based on skill and team.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Connect Meta Ads Account
          </CardTitle>
          <CardDescription>
            Use this section to prepare Facebook and Instagram Lead Ads syncing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Meta access token</label>
              <Input value={metaAccessToken} onChange={(event) => setMetaAccessToken(event.target.value)} placeholder="Paste Meta access token" />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Page ID</label>
              <Input value={metaPageId} onChange={(event) => setMetaPageId(event.target.value)} placeholder="Paste Meta page ID" />
            </div>
            <div className="space-y-2 md:col-span-2">
              <label className="text-sm font-medium">Webhook verify token</label>
              <Input value={metaVerifyToken} onChange={(event) => setMetaVerifyToken(event.target.value)} placeholder="Set the webhook verify token" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/40 p-4 text-sm text-muted">
            <div className="mb-2 flex items-center gap-2 font-medium text-foreground">
              <Webhook className="h-4 w-4" />
              Required steps
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Create a Meta app and enable Webhooks plus Lead Ads.</li>
              <li>Add the callback URL from your backend webhook endpoint.</li>
              <li>Paste the token, page ID, and verify token here and in the backend env file.</li>
              <li>Subscribe your Facebook page to lead generation events.</li>
            </ol>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-sm text-emerald-500">
              <CheckCircle2 className="h-4 w-4" />
              <span>{statusMessage}</span>
            </div>
            <Button onClick={saveMetaConfig}>
              <Save className="mr-2 h-4 w-4" />
              Save Meta Ads Settings
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
