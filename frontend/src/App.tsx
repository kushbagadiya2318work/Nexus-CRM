import { Component, useEffect } from 'react'
import type { ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useCRMStore } from '@/store'
import { Layout } from '@/components/layout/Layout'
import { LoginPage } from '@/components/auth/LoginPage'
import { Dashboard } from '@/components/dashboard/Dashboard'
import { LeadsPage } from '@/components/leads/LeadsPage'
import { LeadDetailsPage } from '@/components/leads/LeadDetailsPage'
import { ClientsPage } from '@/components/clients/ClientsPage'
import { DealsPage } from '@/components/deals/DealsPage'
import { TasksPage } from '@/components/tasks/TasksPage'
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage'
import { AIInsightsPage } from '@/components/ai/AIInsightsPage'
import { IntegrationsPage } from '@/components/integrations/IntegrationsPage'
import { WorkflowsPage } from '@/components/workflows/WorkflowsPage'
import { TeamInboxPage } from '@/components/inbox/TeamInboxPage'
import { AutomationBlueprintPage } from '@/components/automation/AutomationBlueprintPage'

function App() {
  const { isAuthenticated, setCurrentUser, hydrateCRMData } = useCRMStore()

  useEffect(() => {
    // Check for stored auth on mount
    const stored = localStorage.getItem('crm-storage')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.state?.currentUser) {
        setCurrentUser(parsed.state.currentUser)
        void hydrateCRMData()
      }
    }
  }, [hydrateCRMData, setCurrentUser])

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/leads" element={<LeadsPage />} />
        <Route path="/leads/:id" element={<LeadDetailsPage />} />
        <Route path="/clients" element={<ClientsPage />} />
        <Route path="/deals" element={<DealsPage />} />
        <Route path="/tasks" element={<TasksPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/ai-insights" element={<AIInsightsPage />} />
        <Route path="/integrations" element={<IntegrationsPage />} />
        <Route path="/automation" element={<AutomationBlueprintPage />} />
        <Route path="/workflows" element={<WorkflowsPage />} />
        <Route path="/inbox" element={<TeamInboxPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

export default App

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: 'monospace', color: '#f87171', background: '#0f172a', minHeight: '100vh' }}>
          <h2 style={{ color: '#fb923c', marginBottom: 12 }}>⚠ Runtime Error</h2>
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 13 }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

export { ErrorBoundary }
