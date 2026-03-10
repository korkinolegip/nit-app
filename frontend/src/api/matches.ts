import { apiRequest } from './client'

export interface MatchUser {
  name: string
  age: number
  city: string
  personality_type: string | null
  profile_text: string | null
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
