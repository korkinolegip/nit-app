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
  if (!res.ok) throw new Error('Auth failed')
  const data = await res.json()
  accessToken = data.access_token
}

export async function apiRequest(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    await initAuth()
    return apiRequest(path, options)
  }
  if (!res.ok) throw new Error(`API Error: ${res.status}`)
  return res.json()
}
