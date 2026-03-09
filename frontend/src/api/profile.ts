import { apiRequest } from './client'

export async function getProfile() {
  return apiRequest('/api/profile')
}

export async function updateProfile(data: { name?: string; city?: string; goal?: string }) {
  return apiRequest('/api/profile', {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
}

export async function uploadPhoto(file: File) {
  const formData = new FormData()
  formData.append('file', file)

  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const res = await fetch(`${BASE_URL}/api/profile/photos`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Upload failed')
  return res.json()
}
