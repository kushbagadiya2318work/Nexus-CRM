// In production (Vercel) the backend is served from the same origin under
// `/api`, so we default to a relative path. For local development, point
// `VITE_CRM_API_URL` at the standalone Express server (e.g. http://localhost:4000/api).
const API_BASE_URL =
  import.meta.env.VITE_CRM_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api')
let cachedToken: string | null = typeof window !== 'undefined'
  ? window.localStorage.getItem('crm-api-token')
  : null
let cachedRefreshToken: string | null = typeof window !== 'undefined'
  ? window.localStorage.getItem('crm-api-refresh-token')
  : null

export function getStoredToken() {
  return cachedToken
}

export async function loginToApi(email: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!response.ok) {
    return null
  }

  const payload = await response.json()
  cachedToken = payload.accessToken || null
  cachedRefreshToken = payload.refreshToken || null

  if (typeof window !== 'undefined') {
    if (cachedToken) window.localStorage.setItem('crm-api-token', cachedToken)
    if (cachedRefreshToken) window.localStorage.setItem('crm-api-refresh-token', cachedRefreshToken)
  }

  return payload
}

export async function logoutFromApi() {
  await apiRequest('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken: cachedRefreshToken }),
  })
  cachedToken = null
  cachedRefreshToken = null
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('crm-api-token')
    window.localStorage.removeItem('crm-api-refresh-token')
  }
}

async function refreshAccessToken() {
  if (!cachedRefreshToken) return null

  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: cachedRefreshToken }),
  })

  if (!response.ok) return null
  const payload = await response.json()
  cachedToken = payload.accessToken || null
  if (cachedToken && typeof window !== 'undefined') {
    window.localStorage.setItem('crm-api-token', cachedToken)
  }
  return cachedToken
}

export async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const headers = new Headers(options.headers)

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    if (cachedToken) {
      headers.set('Authorization', `Bearer ${cachedToken}`)
    }

    let response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    })

    if (response.status === 401 && await refreshAccessToken()) {
      headers.set('Authorization', `Bearer ${cachedToken}`)
      response = await fetch(`${API_BASE_URL}${path}`, {
        ...options,
        headers,
      })
    }

    if (!response.ok) {
      return null
    }

    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function fetchLeadModuleState() {
  return apiRequest<{ data: unknown[]; total: number }>('/leads')
}

export async function fetchUsersFromApi() {
  return apiRequest<{ data: unknown[]; total: number }>('/users')
}

export async function fetchClientsFromApi() {
  return apiRequest<{ data: unknown[]; total: number }>('/clients')
}

export async function fetchDealsFromApi() {
  return apiRequest<{ data: unknown[]; total: number }>('/deals')
}

export async function fetchTasksFromApi() {
  return apiRequest<{ data: unknown[]; total: number }>('/tasks')
}

export async function fetchIntegrationStatus() {
  return apiRequest<{ data: { metaAds: boolean; whatsapp: boolean; sms: boolean; email: boolean; slack: boolean; sync: boolean; calling: boolean } }>('/integrations/status')
}

export async function fetchAnalyticsOverview() {
  return apiRequest<{
    data: {
      summary: {
        totalLeads: number
        converted: number
        conversionRate: number
        hotLeads: number
        warmLeads: number
        coldLeads: number
        totalValue: number
        avgScore: number
      }
      sourcePerformance: Array<{
        source: string
        leads: number
        conversions: number
        conversionRate: number
        pipelineValue: number
      }>
      funnel: Array<{ stage: string; count: number }>
    }
  }>('/analytics/overview')
}

export async function fetchAutomationBlueprint() {
  return apiRequest<{
    data: {
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
  }>('/automation/blueprint')
}

export async function createLeadInApi(payload: Record<string, unknown>) {
  return apiRequest('/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function createClientInApi(payload: Record<string, unknown>) {
  return apiRequest('/clients', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateLeadInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/leads/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function updateClientInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/clients/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteClientInApi(id: string) {
  return apiRequest(`/clients/${id}`, { method: 'DELETE' })
}

export async function createDealInApi(payload: Record<string, unknown>) {
  return apiRequest('/deals', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateDealInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/deals/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteDealInApi(id: string) {
  return apiRequest(`/deals/${id}`, { method: 'DELETE' })
}

export async function createTaskInApi(payload: Record<string, unknown>) {
  return apiRequest('/tasks', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateTaskInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/tasks/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

export async function deleteTaskInApi(id: string) {
  return apiRequest(`/tasks/${id}`, { method: 'DELETE' })
}

export async function logLeadCallInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/leads/${id}/calls`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function sendLeadMessageInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/leads/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function logClientCallInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/clients/${id}/calls`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function sendClientMessageInApi(id: string, payload: Record<string, unknown>) {
  return apiRequest(`/clients/${id}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
