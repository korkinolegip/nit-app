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
  return apiRequest('/api/profile/photos', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}
