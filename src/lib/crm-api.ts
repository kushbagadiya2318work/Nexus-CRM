const API_BASE_URL = import.meta.env.VITE_CRM_API_URL || 'http://localhost:4000/api'
const DEMO_LOGIN = {
  email: 'manager@nexuscrm.ai',
  password: 'demo123',
}

let cachedToken: string | null = typeof window !== 'undefined'
  ? window.localStorage.getItem('crm-api-token')
  : null

async function getToken(): Promise<string | null> {
  if (cachedToken) {
    return cachedToken
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(DEMO_LOGIN),
    })

    if (!response.ok) {
      return null
    }

    const payload = await response.json()
    cachedToken = payload.accessToken || null

    if (cachedToken && typeof window !== 'undefined') {
      window.localStorage.setItem('crm-api-token', cachedToken)
    }

    return cachedToken
  } catch {
    return null
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  try {
    const token = await getToken()
    const headers = new Headers(options.headers)

    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }

    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    })

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

export async function fetchClientsFromApi() {
  return apiRequest<{ data: unknown[]; total: number }>('/clients')
}

export async function fetchIntegrationStatus() {
  return apiRequest<{ data: { metaAds: boolean; whatsapp: boolean; calling: boolean } }>('/integrations/status')
}

export async function createLeadInApi(payload: Record<string, unknown>) {
  return apiRequest('/leads', {
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
