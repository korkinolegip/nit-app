import { apiRequest } from './client'

export interface ProfileViewer {
  view_id: number
  user_id: number
  name: string
  age: number | null
  city: string | null
  photo_url: string | null
  is_online: boolean
  last_seen_text: string | null
  duration_seconds: number | null
  seen_at: string
  match_id?: number | null
}

export interface ViewsResponse {
  views: ProfileViewer[]
  total: number
}

export async function getMyViewers(): Promise<ViewsResponse> {
  return apiRequest('/api/views/me')
}

export async function getIViewed(): Promise<ViewsResponse> {
  return apiRequest('/api/views/i-viewed')
}

export async function getViewsCount(): Promise<{ count: number }> {
  return apiRequest('/api/views/count')
}

export async function markViewsSeen(): Promise<void> {
  return apiRequest('/api/views/mark-seen', { method: 'POST' })
}

export async function recordProfileView(userId: number, durationSeconds?: number): Promise<void> {
  return apiRequest(`/api/views/${userId}`, {
    method: 'POST',
    body: JSON.stringify({ duration_seconds: durationSeconds ?? null }),
  })
}
