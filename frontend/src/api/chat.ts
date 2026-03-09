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

export async function sendMessage(text: string, type = 'text'): Promise<ChatResponse> {
  return apiRequest('/api/chat/message', {
    method: 'POST',
    body: JSON.stringify({ text, type }),
  })
}

export async function transcribeVoice(file: Blob): Promise<{ text: string; duration_seconds: number }> {
  const formData = new FormData()
  formData.append('file', file, 'audio.ogg')

  const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
  const res = await fetch(`${BASE_URL}/api/voice/transcribe`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) throw new Error('Transcribe failed')
  return res.json()
}
