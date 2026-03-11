import { apiRequest } from './client'

export async function getProfile() {
  return apiRequest('/api/profile')
}

export async function updateProfile(data: { name?: string; age?: number; city?: string; goal?: string; occupation?: string }) {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function uploadPhotos(files: File[]) {
  const formData = new FormData()
  files.forEach(f => formData.append('files', f))
  return apiRequest('/api/profile/photos', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}

export async function deletePhoto(photoId: number) {
  return apiRequest(`/api/profile/photos/${photoId}`, { method: 'DELETE' })
}

export async function setPrimaryPhoto(photoId: number) {
  return apiRequest(`/api/profile/photos/${photoId}/primary`, { method: 'POST' })
}

export async function deleteProfile() {
  return apiRequest('/api/profile', { method: 'DELETE' })
}

export interface CompletedTest {
  test_id: number
  category: string
  pattern_key: string | null
  result_key: string | null
  result_title: string
  completed_at: string
}

export async function getMyTests(): Promise<{ tests: CompletedTest[] }> {
  return apiRequest('/api/profile/tests')
}
