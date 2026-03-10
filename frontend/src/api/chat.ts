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

export async function getChatHistory(): Promise<{ messages: { sender: 'ai' | 'me'; text: string; type: string }[] }> {
  return apiRequest('/api/chat/history')
}

export async function pingActivity(): Promise<void> {
  return apiRequest('/api/chat/ping', { method: 'POST' })
}

export interface ActivitySummary {
  new_matches: number
  new_messages: number
  new_views: number
  open_chats: number
  has_activity: boolean
}

export async function getActivitySummary(): Promise<ActivitySummary> {
  return apiRequest('/api/chat/activity')
}

export interface GreetingTile {
  icon: string
  label: string
  screen: string
  count: number
}

export interface GreetingMenuButton {
  icon: string
  label: string
  screen: string
}

export interface GreetingResponse {
  should_greet: boolean
  has_activity?: boolean
  text?: string
  tiles?: GreetingTile[]
  menu_buttons?: GreetingMenuButton[]
}

export async function getGreeting(): Promise<GreetingResponse> {
  return apiRequest('/api/chat/greeting')
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
