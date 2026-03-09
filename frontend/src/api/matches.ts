import { apiRequest } from './client'

export async function getMatches(limit = 5, offset = 0) {
  return apiRequest(`/api/matches?limit=${limit}&offset=${offset}`)
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

export async function consentExchange(matchId: number, consent: boolean) {
  return apiRequest(`/api/match-chat/${matchId}/consent-exchange`, {
    method: 'POST',
    body: JSON.stringify({ consent }),
  })
}
