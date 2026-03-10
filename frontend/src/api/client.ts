const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

let accessToken: string | null = null

export async function initAuth(): Promise<void> {
  const tg = (window as any).Telegram?.WebApp
  if (!tg?.initData) {
    console.warn('No Telegram initData available (dev mode)')
    return
  }

  const res = await fetch(`${BASE_URL}/api/auth/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initData: tg.initData }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`Auth failed: ${res.status} ${JSON.stringify(body)}`)
  }
  const data = await res.json()
  accessToken = data.access_token
}

export async function apiRequest(path: string, options: RequestInit = {}, _retry = false) {
  const isFormData = options.body instanceof FormData

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      // Don't set Content-Type for FormData — browser sets multipart/form-data + boundary automatically
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401 && !_retry) {
    await initAuth()
    return apiRequest(path, options, true)
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(`API ${res.status}: ${JSON.stringify(body.detail ?? body)}`)
  }
  return res.json()
}
