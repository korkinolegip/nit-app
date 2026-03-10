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
}

export interface Match {
  match_id: number
  user: MatchUser
  compatibility_score: number
  explanation: string | null
  user_action: 'like' | 'skip' | null
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

export async function getMatchMessages(matchId: number) {
  return apiRequest(`/api/match-chat/${matchId}/messages`)
}

export async function sendMatchMessage(matchId: number, text: string) {
  return apiRequest(`/api/match-chat/${matchId}/send`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}
