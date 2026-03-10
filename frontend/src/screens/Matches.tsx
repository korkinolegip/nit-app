import { useState, useEffect } from 'react'
import { getMatches, matchAction, Match } from '../api/matches'

interface MatchesProps {
  onBack: () => void
  onOpenChat: (matchId: number) => void
}

export default function Matches({ onBack, onOpenChat }: MatchesProps) {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<number | null>(null)

  useEffect(() => {
    getMatches()
      .then(data => setMatches(data.matches))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pending = matches.filter(m => m.user_action === null)
  const liked = matches.filter(m => m.user_action === 'like')

  const handleAction = async (matchId: number, action: 'like' | 'skip') => {
    setActing(matchId)
    try {
      const res = await matchAction(matchId, action)
      setMatches(prev => prev.map(m =>
        m.match_id === matchId ? { ...m, user_action: action } : m
      ))
      if (res.mutual_match && res.match_chat_id) {
        onOpenChat(res.match_chat_id)
      }
    } catch {
      // ignore
    } finally {
      setActing(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px',
        paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)', background: 'var(--bg)', flexShrink: 0,
      }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--d2)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>МАТЧИ</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--d3)' }} />
          </div>
        ) : matches.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--d3)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔍</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--d2)', marginBottom: 8 }}>Алгоритм ищет</div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>Матчи появятся после того как<br />алгоритм подберёт совместимых людей</div>
          </div>
        ) : (
          <>
            {/* Pending matches */}
            {pending.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--d3)', textTransform: 'uppercase', marginBottom: 12 }}>
                  Новые — {pending.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
                  {pending.map(m => (
                    <MatchCard key={m.match_id} match={m} acting={acting === m.match_id} onAction={handleAction} />
                  ))}
                </div>
              </>
            )}

            {/* Liked matches (mutual chats) */}
            {liked.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--d3)', textTransform: 'uppercase', marginBottom: 12 }}>
                  Вы выбрали — {liked.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {liked.map(m => (
                    <div key={m.match_id} style={{
                      background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
                      padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer',
                    }} onClick={() => onOpenChat(m.match_id)}>
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, background: 'var(--bg)',
                        border: '1px solid var(--l)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 18, flexShrink: 0,
                      }}>
                        {m.user.name[0]}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--w)' }}>{m.user.name}, {m.user.age}</div>
                        <div style={{ fontSize: 12, color: 'var(--d3)', marginTop: 2 }}>{m.user.city}</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--d2)' }}>
                        {Math.round(m.compatibility_score)}%
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function MatchCard({ match: m, acting, onAction }: {
  match: Match
  acting: boolean
  onAction: (id: number, action: 'like' | 'skip') => void
}) {
  const photo = m.user.photos.find(p => p.is_primary) || m.user.photos[0]

  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Photo area */}
      <div style={{
        height: 200, background: 'var(--bg)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative',
      }}>
        {photo?.url ? (
          <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ fontSize: 64, color: 'var(--d4)' }}>{m.user.name[0]}</div>
        )}
        {/* Compatibility badge */}
        <div style={{
          position: 'absolute', top: 12, right: 12,
          background: 'rgba(0,0,0,.7)', borderRadius: 20,
          padding: '4px 10px', fontSize: 13, fontWeight: 700, color: 'var(--w)',
        }}>
          {Math.round(m.compatibility_score)}%
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '14px 16px' }}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--w)', marginBottom: 2 }}>
          {m.user.name}, {m.user.age}
        </div>
        <div style={{ fontSize: 13, color: 'var(--d3)', marginBottom: m.explanation ? 10 : 0 }}>
          {m.user.city}
        </div>
        {m.explanation && (
          <div style={{ fontSize: 13, color: 'var(--d2)', lineHeight: 1.6, marginBottom: 4 }}>
            {m.explanation}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 16px' }}>
        <button
          onClick={() => onAction(m.match_id, 'skip')}
          disabled={acting}
          style={{
            flex: 1, padding: '12px', background: 'none',
            border: '1px solid var(--l)', borderRadius: 12,
            color: 'var(--d3)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Пропустить
        </button>
        <button
          onClick={() => onAction(m.match_id, 'like')}
          disabled={acting}
          style={{
            flex: 1, padding: '12px', background: 'var(--w)',
            border: 'none', borderRadius: 12,
            color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Написать
        </button>
      </div>
    </div>
  )
}
