import { apiRequest } from './client'

export interface ChatResponse {
  reply: string
  reply_type: string
  interview_complete: boolean
  questionnaire_complete: boolean
  collected_data: Record<string, any> | null
  quick_replies: string[] | null
  card_data: Record<string, any> | null
}

export interface ChatStatus {
  has_session: boolean
  is_complete: boolean
  profile_ready: boolean
  onboarding_step: string
  has_photos: boolean
}

export async function sendMessage(text: string, type = 'text'): Promise<ChatResponse> {
  return apiRequest('/api/chat/message', {
    method: 'POST',
    body: JSON.stringify({ text, type }),
  })
}

export async function getChatStatus(): Promise<ChatStatus> {
  return apiRequest('/api/chat/status')
}

export async function transcribeVoice(file: Blob): Promise<{ text: string; duration_seconds: number }> {
  const ext = file.type.includes('mp4') ? 'audio.mp4' : file.type.includes('ogg') ? 'audio.ogg' : 'audio.webm'
  const formData = new FormData()
  formData.append('file', file, ext)
  return apiRequest('/api/voice/transcribe', {
    method: 'POST',
    body: formData,
    headers: {},
  })
}
