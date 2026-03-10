import { useState, useEffect, useRef } from 'react'
import { getMatches, matchAction, restoreSkip, Match } from '../api/matches'
import { recordProfileView } from '../api/views'
import Loader from '../components/Loader'

interface MatchesProps {
  onBack: () => void
  onOpenChat: (matchId: number) => void
  chatsOnly?: boolean
}

function daysSince(isoDate: string | undefined): number {
  if (!isoDate) return 999
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86_400_000)
}

function OnlineDot({ isOnline }: { isOnline: boolean }) {
  if (!isOnline) return null
  return (
    <div style={{
      width: 8, height: 8, borderRadius: '50%',
      background: '#22c55e', border: '2px solid var(--bg3)',
      display: 'inline-block', marginLeft: 4, flexShrink: 0,
    }} />
  )
}

function NewBadge() {
  return (
    <span style={{
      background: '#ff4466', color: '#fff',
      borderRadius: 5, padding: '2px 5px',
      fontSize: 9, fontWeight: 800, letterSpacing: '.06em',
      lineHeight: 1.4, marginLeft: 5,
    }}>
      NEW
    </span>
  )
}

export default function Matches({ onBack, onOpenChat, chatsOnly = false }: MatchesProps) {
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<number | null>(null)
  const [viewingMatch, setViewingMatch] = useState<Match | null>(null)

  useEffect(() => {
    getMatches()
      .then(data => setMatches(data.matches))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const pending = chatsOnly ? [] : matches.filter(m => m.user_action === null)
  const liked = matches.filter(m => m.user_action === 'like')
  const skipped = chatsOnly ? [] : matches.filter(m => m.user_action === 'skip' && m.restore_count < 2)

  const handleRestore = async (matchId: number) => {
    setActing(matchId)
    try {
      await restoreSkip(matchId)
      setMatches(prev => prev.map(m =>
        m.match_id === matchId ? { ...m, user_action: null, restore_count: m.restore_count + 1 } : m
      ))
      setViewingMatch(null)
    } catch {
      // ignore
    } finally {
      setActing(null)
    }
  }

  const handleAction = async (matchId: number, action: 'like' | 'skip') => {
    setActing(matchId)
    try {
      const res = await matchAction(matchId, action)
      setMatches(prev => prev.map(m =>
        m.match_id === matchId ? { ...m, user_action: action } : m
      ))
      setViewingMatch(null)
      if (res.mutual_match && res.match_chat_id) {
        onOpenChat(res.match_chat_id)
      }
    } catch {
      // ignore
    } finally {
      setActing(null)
    }
  }


  const openProfile = (m: Match) => {
    openProfile(m)
    recordProfileView(m.partner_user_id).catch(() => {})
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
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>{chatsOnly ? 'ЧАТЫ' : 'МАТЧИ'}</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
          <Loader />
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
                    <MatchCard
                      key={m.match_id}
                      match={m}
                      acting={acting === m.match_id}
                      onAction={handleAction}
                      onViewProfile={() => openProfile(m)}
                    />
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
                  {liked.map(m => {
                    const photo = m.user.photos.find(p => p.is_primary) || m.user.photos[0]
                    return (
                      <div key={m.match_id} style={{
                        background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
                        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
                      }}>
                        {/* Avatar — tap opens profile */}
                        <div
                          onClick={() => openProfile(m)}
                          style={{
                            width: 44, height: 44, borderRadius: 12, background: 'var(--bg)',
                            border: '1px solid var(--l)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, flexShrink: 0, overflow: 'hidden', cursor: 'pointer',
                          }}
                        >
                          {photo?.url
                            ? <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : m.user.name[0]
                          }
                        </div>
                        {/* Info — tap opens profile */}
                        <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => openProfile(m)}>
                          <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--w)', display: 'flex', alignItems: 'center' }}>
                            {m.user.name}, {m.user.age}
                            {daysSince(m.user.created_at) < 2 && <NewBadge />}
                            <OnlineDot isOnline={m.user.is_online} />
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--d3)', marginTop: 2 }}>
                            {m.user.is_online ? <span style={{ color: '#22c55e' }}>онлайн</span> : m.user.city}
                          </div>
                        </div>
                        {/* Score */}
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--d2)', marginRight: 4 }}>
                          {Math.round(m.compatibility_score)}%
                        </div>
                        {/* Chat button */}
                        <button
                          onClick={() => onOpenChat(m.match_id)}
                          style={{
                            padding: '8px 14px', background: 'var(--w)',
                            border: 'none', borderRadius: 10,
                            color: 'var(--bg)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
                          }}
                        >
                          Чат
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Skipped matches (restorable) */}
            {skipped.length > 0 && (
              <>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--d3)', textTransform: 'uppercase', marginBottom: 12, marginTop: liked.length > 0 ? 24 : 0 }}>
                  Пропущено — {skipped.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {skipped.map(m => {
                    const photo = m.user.photos.find(p => p.is_primary) || m.user.photos[0]
                    return (
                      <div key={m.match_id} style={{
                        background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
                        padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, opacity: 0.75,
                      }}>
                        <div
                          onClick={() => openProfile(m)}
                          style={{
                            width: 44, height: 44, borderRadius: 12, background: 'var(--bg)',
                            border: '1px solid var(--l)', overflow: 'hidden', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer',
                          }}
                        >
                          {photo?.url
                            ? <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : m.user.name[0]
                          }
                        </div>
                        <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => openProfile(m)}>
                          <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--d2)' }}>{m.user.name}, {m.user.age}</div>
                          <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 2 }}>
                            {Math.round(m.compatibility_score)}% · осталось восстановлений: {2 - m.restore_count}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRestore(m.match_id)}
                          disabled={acting === m.match_id}
                          style={{
                            padding: '7px 14px', background: 'none',
                            border: '1px solid var(--l)', borderRadius: 10,
                            color: 'var(--d2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter',
                          }}
                        >
                          Вернуть
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Profile modal */}
      {viewingMatch && (
        <MatchProfileModal
          match={viewingMatch}
          acting={acting === viewingMatch.match_id}
          onClose={() => setViewingMatch(null)}
          onAction={viewingMatch.user_action === null
            ? (action) => handleAction(viewingMatch.match_id, action)
            : undefined
          }
          onRestore={viewingMatch.user_action === 'skip' && viewingMatch.restore_count < 2
            ? () => handleRestore(viewingMatch.match_id)
            : undefined
          }
          onOpenChat={viewingMatch.user_action === 'like'
            ? () => { setViewingMatch(null); onOpenChat(viewingMatch.match_id) }
            : undefined
          }
        />
      )}
    </div>
  )
}

function MatchCard({ match: m, acting, onAction, onViewProfile }: {
  match: Match
  acting: boolean
  onAction: (id: number, action: 'like' | 'skip') => void
  onViewProfile: () => void
}) {
  const photo = m.user.photos.find(p => p.is_primary) || m.user.photos[0]

  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 16, overflow: 'hidden',
    }}>
      {/* Photo area — tappable to open profile */}
      <div
        onClick={onViewProfile}
        style={{
          height: 200, background: 'var(--bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', cursor: 'pointer',
        }}
      >
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
        {/* NEW badge */}
        {daysSince(m.user.created_at) < 2 && (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            background: '#ff4466', color: '#fff',
            borderRadius: 8, padding: '4px 8px',
            fontSize: 10, fontWeight: 800, letterSpacing: '.06em',
          }}>
            NEW
          </div>
        )}
        {/* Online indicator */}
        {m.user.is_online && (
          <div style={{
            position: 'absolute', bottom: 10, left: 12,
            background: 'rgba(0,0,0,.6)', borderRadius: 20,
            padding: '3px 8px', fontSize: 11, color: '#4ade80',
            display: 'flex', alignItems: 'center', gap: 5,
          }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            онлайн
          </div>
        )}
        {/* Profile hint */}
        <div style={{
          position: 'absolute', bottom: 10, right: 12,
          fontSize: 11, color: 'rgba(255,255,255,.45)',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          Профиль
        </div>
      </div>

      {/* Info — tappable to open profile */}
      <div style={{ padding: '14px 16px', cursor: 'pointer' }} onClick={onViewProfile}>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--w)', marginBottom: 2, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
          {m.user.name}, {m.user.age}
          {daysSince(m.user.created_at) < 2 && <NewBadge />}
        </div>
        <div style={{ fontSize: 13, color: 'var(--d3)', marginBottom: m.explanation ? 10 : 0 }}>
          {m.user.city}
          {daysSince(m.user.created_at) >= 2 && (
            <span style={{ color: 'var(--d4)', marginLeft: 8, fontSize: 11 }}>
              С нами {daysSince(m.user.created_at)} дн.
            </span>
          )}
        </div>
        {m.explanation && (
          <div style={{ fontSize: 13, color: 'var(--d2)', lineHeight: 1.6, marginBottom: 4, fontStyle: 'italic' }}>
            "{m.explanation}"
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
            color: 'var(--d3)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter',
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
            color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
          }}
        >
          Написать
        </button>
      </div>
    </div>
  )
}

function MatchProfileModal({ match: m, acting, onClose, onAction, onRestore, onOpenChat }: {
  match: Match
  acting: boolean
  onClose: () => void
  onAction?: (action: 'like' | 'skip') => void
  onRestore?: () => void
  onOpenChat?: () => void
}) {
  const photos = m.user.photos.filter(p => p.url)
  const primaryIdx = photos.findIndex(p => p.is_primary)
  const orderedPhotos = primaryIdx > 0
    ? [photos[primaryIdx], ...photos.filter((_, i) => i !== primaryIdx)]
    : photos
  const [pi, setPi] = useState(0)
  const touchStartX = useRef(0)

  const hasActions = onAction || onRestore || onOpenChat

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      animation: 'slideUpFull 0.3s cubic-bezier(0.34,1.1,0.64,1)',
    }}>
      {/* Photo carousel */}
      <div
        style={{ height: '55vh', position: 'relative', background: 'var(--bg2)', flexShrink: 0 }}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - touchStartX.current
          if (dx < -40 && pi < orderedPhotos.length - 1) setPi(i => i + 1)
          if (dx > 40 && pi > 0) setPi(i => i - 1)
        }}
      >
        {orderedPhotos[pi]?.url ? (
          <img src={orderedPhotos[pi].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, color: 'var(--d4)' }}>
            {m.user.name[0]}
          </div>
        )}
        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 'max(16px, env(safe-area-inset-top, 16px))', left: 16,
          width: 36, height: 36, borderRadius: '50%',
          background: 'rgba(0,0,0,.5)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="rgba(255,255,255,.9)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        {/* Compat */}
        <div style={{
          position: 'absolute', top: 'max(16px, env(safe-area-inset-top, 16px))', right: 16,
          background: 'rgba(0,0,0,.65)', borderRadius: 20, padding: '5px 12px',
          fontSize: 14, fontWeight: 700, color: '#fff', backdropFilter: 'blur(4px)',
        }}>
          {Math.round(m.compatibility_score)}%
        </div>
        {/* Dots */}
        {orderedPhotos.length > 1 && (
          <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', gap: 4, justifyContent: 'center' }}>
            {orderedPhotos.map((_, i) => (
              <div key={i} onClick={() => setPi(i)} style={{
                height: 3, borderRadius: 2, cursor: 'pointer',
                width: i === pi ? 20 : 8,
                background: i === pi ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)',
                transition: 'width 0.2s',
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--w)', letterSpacing: '-0.02em' }}>
          {m.user.name}, {m.user.age}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {m.user.city && <Chip icon="📍">{m.user.city}</Chip>}
          {m.user.occupation && <Chip icon="💼">{m.user.occupation}</Chip>}
          {m.user.goal && <Chip icon="🎯">{m.user.goal}</Chip>}
          {m.user.personality_type && <Chip icon="🧠">{m.user.personality_type}</Chip>}
          {m.user.attachment_hint && <Chip icon="🔗">{attachmentLabel(m.user.attachment_hint)}</Chip>}
        </div>
        {m.explanation && (
          <div style={{
            marginTop: 16, padding: '14px 16px',
            background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
            fontSize: 13, color: 'var(--d2)', lineHeight: 1.65, fontStyle: 'italic',
          }}>
            "{m.explanation}"
          </div>
        )}
        {m.user.profile_text && (
          <Section label="О себе">
            <div style={{ fontSize: 14, color: 'var(--d2)', lineHeight: 1.7 }}>{m.user.profile_text}</div>
          </Section>
        )}
        {m.user.strengths.length > 0 && (
          <Section label="Сильные стороны">
            <TagList items={m.user.strengths} />
          </Section>
        )}
        {m.user.ideal_partner_traits.length > 0 && (
          <Section label="Ищет в партнёре">
            <TagList items={m.user.ideal_partner_traits} />
          </Section>
        )}
        <div style={{ height: 20 }} />
      </div>

      {/* Bottom actions */}
      {hasActions && (
        <div style={{
          display: 'flex', gap: 10, padding: '14px 20px',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          flexShrink: 0, borderTop: '1px solid var(--l)',
        }}>
          {onAction && (
            <>
              <button onClick={() => onAction('skip')} disabled={acting} style={{
                flex: 1, padding: '14px', background: 'none',
                border: '1px solid var(--l)', borderRadius: 14,
                color: 'var(--d3)', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter',
              }}>
                Пропустить
              </button>
              <button onClick={() => onAction('like')} disabled={acting} style={{
                flex: 2, padding: '14px', background: 'var(--w)',
                border: 'none', borderRadius: 14,
                color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
              }}>
                Написать
              </button>
            </>
          )}
          {onRestore && (
            <button onClick={onRestore} disabled={acting} style={{
              flex: 1, padding: '14px', background: 'var(--w)',
              border: 'none', borderRadius: 14,
              color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
            }}>
              Вернуть в список
            </button>
          )}
          {onOpenChat && (
            <button onClick={onOpenChat} style={{
              flex: 1, padding: '14px', background: 'var(--w)',
              border: 'none', borderRadius: 14,
              color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
            }}>
              Открыть чат
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes slideUpFull { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </div>
  )
}

function Chip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'var(--bg3)', border: '1px solid var(--l)',
      borderRadius: 20, padding: '5px 10px', fontSize: 13, color: 'var(--d2)',
    }}>
      <span style={{ fontSize: 12 }}>{icon}</span>
      {children}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.07em', color: 'var(--d3)', textTransform: 'uppercase' as const, marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function TagList({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {items.map((item, i) => (
        <div key={i} style={{
          background: 'var(--bg3)', border: '1px solid var(--l)',
          borderRadius: 20, padding: '5px 12px', fontSize: 13, color: 'var(--d2)',
        }}>
          {item}
        </div>
      ))}
    </div>
  )
}

function attachmentLabel(hint: string): string {
  const map: Record<string, string> = {
    secure: 'Надёжный тип',
    anxious: 'Тревожный тип',
    avoidant: 'Избегающий тип',
    disorganized: 'Дезорганизованный',
  }
  return map[hint] || hint
}
