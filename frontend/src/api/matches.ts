import { apiRequest } from './client'

export interface MatchUser {
  name: string
  age: number
  city: string
  goal: string | null
  occupation: string | null
  personality_type: string | null
  profile_text: string | null
  attachment_hint: string | null
  strengths: string[]
  ideal_partner_traits: string[]
  photos: { url: string; is_primary: boolean }[]
  is_online: boolean
  last_seen_text: string | null
  created_at: string
}

export interface Match {
  match_id: number
  partner_user_id: number
  user: MatchUser
  compatibility_score: number
  explanation: string | null
  user_action: 'like' | 'skip' | null
  match_status: 'pending' | 'accepted' | 'declined' | 'matched' | null
  restore_count: number
  has_unread: boolean
}

export async function restoreSkip(matchId: number) {
  return apiRequest(`/api/matches/${matchId}/restore`, { method: 'POST' })
}

export async function acceptMatch(matchId: number): Promise<{ ok: boolean; match_chat_id: number }> {
  return apiRequest(`/api/matches/${matchId}/accept`, { method: 'POST' })
}

export async function declineMatch(matchId: number): Promise<{ ok: boolean }> {
  return apiRequest(`/api/matches/${matchId}/decline`, { method: 'POST' })
}

export async function deleteMatchChat(matchId: number): Promise<void> {
  return apiRequest(`/api/match-chat/${matchId}`, { method: 'DELETE' })
}

export interface MatchesResponse {
  matches: Match[]
  remaining_today: number
}

export async function getMatches(offset = 0): Promise<MatchesResponse> {
  return apiRequest(`/api/matches?limit=10&offset=${offset}`)
}

export async function matchAction(matchId: number, action: 'like' | 'skip') {
  return apiRequest(`/api/matches/${matchId}/action`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export interface MatchPartnerProfile {
  name: string
  age: number | null
  city: string | null
  occupation: string | null
  goal: string | null
  personality_type: string | null
  profile_text: string | null
  attachment_hint: string | null
  strengths: string[]
  ideal_partner_traits: string[]
  photos: { url: string; is_primary: boolean }[]
  is_online: boolean
  last_seen_text: string | null
  created_at: string | null
}

export interface MatchChatData {
  my_user_id: number
  messages: {
    id: number
    sender_id: number
    content_type: string
    text: string | null
    created_at: string
  }[]
  chat_status: string
  deadline: string | null
  compatibility_score: number
  explanation: string | null
  partner: MatchPartnerProfile
}

export async function getMatchMessages(matchId: number): Promise<MatchChatData> {
  return apiRequest(`/api/match-chat/${matchId}/messages`)
}

export async function sendMatchMessage(matchId: number, text: string) {
  return apiRequest(`/api/match-chat/${matchId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export interface PublicUserProfile {
  user_id: number
  name: string
  age: number | null
  city: string | null
  gender: string | null
  occupation: string | null
  goal: string | null
  personality_type: string | null
  profile_text: string | null
  attachment_hint: string | null
  strengths: string[]
  ideal_partner_traits: string[]
  photos: { url: string; is_primary: boolean }[]
  is_online: boolean
  last_seen_text: string | null
  created_at: string | null
}

export async function getUserById(userId: number): Promise<PublicUserProfile> {
  return apiRequest(`/api/matches/user/${userId}`)
}

export interface DirectLikeResponse {
  mutual_match: boolean
  match_chat_id: number | null
  match_id: number
  my_gender: string | null
  partner_gender: string | null
}

export async function likeUser(userId: number): Promise<DirectLikeResponse> {
  return apiRequest(`/api/matches/like-user/${userId}`, { method: 'POST' })
}
