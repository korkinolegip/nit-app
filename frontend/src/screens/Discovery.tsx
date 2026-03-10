import { useState, useEffect, useRef } from 'react'
import { getMatches, matchAction, Match } from '../api/matches'

interface DiscoveryProps {
  onBack: () => void
  onOpenChat: (matchId: number) => void
}

export default function Discovery({ onBack, onOpenChat }: DiscoveryProps) {
  const [candidates, setCandidates] = useState<Match[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [exitAnim, setExitAnim] = useState<'left' | 'right' | null>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  useEffect(() => {
    getMatches(0)
      .then(data => {
        const pending = data.matches.filter(m => m.user_action === null)
        setCandidates(pending)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const current = candidates[currentIndex]

  // Reset photo index when card changes
  useEffect(() => {
    setPhotoIndex(0)
    setShowProfile(false)
  }, [currentIndex])

  const advance = (anim: 'left' | 'right') => {
    setExitAnim(anim)
    setTimeout(() => {
      setExitAnim(null)
      setCurrentIndex(i => i + 1)
    }, 300)
  }

  const handleAction = async (action: 'like' | 'skip') => {
    if (!current || acting) return
    setActing(true)
    try {
      const res = await matchAction(current.match_id, action)
      advance(action === 'like' ? 'right' : 'left')
      if (res.mutual_match && res.match_chat_id) {
        setTimeout(() => onOpenChat(res.match_chat_id), 350)
      }
    } catch {
      // ignore
    } finally {
      setActing(false)
    }
  }

  const photos = current?.user.photos.filter(p => p.url) ?? []
  const primaryIdx = photos.findIndex(p => p.is_primary)
  const orderedPhotos = primaryIdx > 0
    ? [photos[primaryIdx], ...photos.filter((_, i) => i !== primaryIdx)]
    : photos

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current)
    if (dy > 50) return // vertical scroll, ignore
    if (dx < -40 && photoIndex < orderedPhotos.length - 1) setPhotoIndex(i => i + 1)
    if (dx > 40 && photoIndex > 0) setPhotoIndex(i => i - 1)
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
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>ЛЮДИ</div>
        <div style={{ width: 32 }} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--d3)' }} />
          </div>
        ) : candidates.length === 0 || currentIndex >= candidates.length ? (
          <EmptyState onBack={onBack} exhausted={candidates.length > 0} />
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Card */}
            <div style={{
              flex: 1, margin: '12px 12px 0', borderRadius: '20px', overflow: 'hidden',
              position: 'relative', background: 'var(--bg3)',
              transform: exitAnim === 'right' ? 'translateX(110%) rotate(8deg)' : exitAnim === 'left' ? 'translateX(-110%) rotate(-8deg)' : 'none',
              transition: exitAnim ? 'transform 0.3s cubic-bezier(0.4,0,0.6,1)' : 'none',
            }}>
              {/* Photo area */}
              <div
                style={{ position: 'absolute', inset: 0 }}
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
                onClick={() => setShowProfile(true)}
              >
                {orderedPhotos.length > 0 ? (
                  <img
                    key={photoIndex}
                    src={orderedPhotos[photoIndex]?.url}
                    alt=""
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div style={{
                    width: '100%', height: '100%', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 80, color: 'var(--d4)',
                    background: 'var(--bg2)',
                  }}>
                    {current.user.name[0]}
                  </div>
                )}

                {/* Gradient overlay */}
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to bottom, transparent 40%, rgba(0,0,0,0.75) 100%)',
                }} />

                {/* Photo dots */}
                {orderedPhotos.length > 1 && (
                  <div style={{
                    position: 'absolute', top: 12, left: 0, right: 0,
                    display: 'flex', gap: '4px', justifyContent: 'center',
                  }}>
                    {orderedPhotos.map((_, i) => (
                      <div key={i} style={{
                        height: 3, borderRadius: 2,
                        width: i === photoIndex ? 20 : 8,
                        background: i === photoIndex ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.35)',
                        transition: 'width 0.2s, background 0.2s',
                      }} />
                    ))}
                  </div>
                )}

                {/* Compatibility badge */}
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: 'rgba(0,0,0,.65)', borderRadius: 20,
                  padding: '5px 12px', fontSize: 14, fontWeight: 700, color: '#fff',
                  backdropFilter: 'blur(4px)',
                }}>
                  {Math.round(current.compatibility_score)}%
                </div>

                {/* Photo nav tap zones */}
                {orderedPhotos.length > 1 && (
                  <>
                    <div
                      style={{ position: 'absolute', top: 0, left: 0, width: '30%', height: '60%' }}
                      onClick={e => { e.stopPropagation(); if (photoIndex > 0) setPhotoIndex(i => i - 1) }}
                    />
                    <div
                      style={{ position: 'absolute', top: 0, right: 0, width: '30%', height: '60%' }}
                      onClick={e => { e.stopPropagation(); if (photoIndex < orderedPhotos.length - 1) setPhotoIndex(i => i + 1) }}
                    />
                  </>
                )}

                {/* Info overlay */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px 18px 14px' }}>
                  <div style={{ fontSize: 24, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
                    {current.user.name}, {current.user.age}
                  </div>
                  <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)', marginTop: 3 }}>
                    {current.user.city}
                    {current.user.personality_type && ` · ${current.user.personality_type}`}
                  </div>
                  {current.explanation && (
                    <div style={{
                      marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,.85)',
                      lineHeight: 1.5, fontStyle: 'italic',
                    }}>
                      "{current.explanation}"
                    </div>
                  )}
                  {/* "Открыть профиль" hint */}
                  <div style={{
                    marginTop: 10, display: 'flex', alignItems: 'center', gap: 5,
                    fontSize: 12, color: 'rgba(255,255,255,.45)',
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    Нажми чтобы открыть профиль
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 12, padding: '14px 16px', paddingBottom: 'max(14px, env(safe-area-inset-bottom, 14px))', flexShrink: 0 }}>
              <button
                onClick={() => handleAction('skip')}
                disabled={acting}
                style={{
                  flex: 1, padding: '15px', background: 'none',
                  border: '1px solid var(--l)', borderRadius: 14,
                  color: 'var(--d3)', fontSize: 15, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'Inter',
                }}
              >
                Пропустить
              </button>
              <button
                onClick={() => handleAction('like')}
                disabled={acting}
                style={{
                  flex: 2, padding: '15px', background: 'var(--w)',
                  border: 'none', borderRadius: 14,
                  color: 'var(--bg)', fontSize: 15, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'Inter', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', gap: 8,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 21C12 21 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z"/>
                </svg>
                Нравится
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Profile detail modal */}
      {showProfile && current && (
        <ProfileModal
          match={current}
          photos={orderedPhotos}
          onClose={() => setShowProfile(false)}
          onLike={() => { setShowProfile(false); handleAction('like') }}
          onSkip={() => { setShowProfile(false); handleAction('skip') }}
        />
      )}
    </div>
  )
}

function ProfileModal({ match: m, photos, onClose, onLike, onSkip }: {
  match: Match
  photos: { url: string; is_primary: boolean }[]
  onClose: () => void
  onLike: () => void
  onSkip: () => void
}) {
  const [pi, setPi] = useState(0)
  const touchStartX = useRef(0)

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
          if (dx < -40 && pi < photos.length - 1) setPi(i => i + 1)
          if (dx > 40 && pi > 0) setPi(i => i - 1)
        }}
      >
        {photos[pi]?.url ? (
          <img src={photos[pi].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
        {/* Compat badge */}
        <div style={{
          position: 'absolute', top: 'max(16px, env(safe-area-inset-top, 16px))', right: 16,
          background: 'rgba(0,0,0,.65)', borderRadius: 20, padding: '5px 12px',
          fontSize: 14, fontWeight: 700, color: '#fff', backdropFilter: 'blur(4px)',
        }}>
          {Math.round(m.compatibility_score)}%
        </div>
        {/* Photo dots */}
        {photos.length > 1 && (
          <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', gap: 4, justifyContent: 'center' }}>
            {photos.map((_, i) => (
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
        {/* Name + age */}
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--w)', letterSpacing: '-0.02em' }}>
          {m.user.name}, {m.user.age}
        </div>

        {/* Key facts row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 10 }}>
          {m.user.city && <Chip icon="📍">{m.user.city}</Chip>}
          {m.user.occupation && <Chip icon="💼">{m.user.occupation}</Chip>}
          {m.user.goal && <Chip icon="🎯">{m.user.goal}</Chip>}
          {m.user.personality_type && <Chip icon="🧠">{m.user.personality_type}</Chip>}
          {m.user.attachment_hint && <Chip icon="🔗">{attachmentLabel(m.user.attachment_hint)}</Chip>}
        </div>

        {/* AI explanation */}
        {m.explanation && (
          <div style={{
            marginTop: 16, padding: '14px 16px',
            background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
            fontSize: 13, color: 'var(--d2)', lineHeight: 1.65, fontStyle: 'italic',
          }}>
            "{m.explanation}"
          </div>
        )}

        {/* About */}
        {m.user.profile_text && (
          <Section label="О себе">
            <div style={{ fontSize: 14, color: 'var(--d2)', lineHeight: 1.7 }}>
              {m.user.profile_text}
            </div>
          </Section>
        )}

        {/* Strengths */}
        {m.user.strengths.length > 0 && (
          <Section label="Сильные стороны">
            <TagList items={m.user.strengths} />
          </Section>
        )}

        {/* Ideal partner */}
        {m.user.ideal_partner_traits.length > 0 && (
          <Section label="Ищет в партнёре">
            <TagList items={m.user.ideal_partner_traits} />
          </Section>
        )}

        <div style={{ height: 20 }} />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12, padding: '14px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', flexShrink: 0, borderTop: '1px solid var(--l)' }}>
        <button onClick={onSkip} style={{
          flex: 1, padding: '15px', background: 'none',
          border: '1px solid var(--l)', borderRadius: 14,
          color: 'var(--d3)', fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter',
        }}>
          Пропустить
        </button>
        <button onClick={onLike} style={{
          flex: 2, padding: '15px', background: 'var(--w)',
          border: 'none', borderRadius: 14,
          color: 'var(--bg)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21C12 21 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z"/>
          </svg>
          Нравится
        </button>
      </div>

      <style>{`
        @keyframes slideUpFull { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </div>
  )
}

// Helper components
function Chip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'var(--bg3)', border: '1px solid var(--l)',
      borderRadius: 20, padding: '5px 10px',
      fontSize: 13, color: 'var(--d2)',
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
          borderRadius: 20, padding: '5px 12px',
          fontSize: 13, color: 'var(--d2)',
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

function EmptyState({ onBack, exhausted }: { onBack: () => void; exhausted: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 32 }}>
      <div style={{
        width: 72, height: 72, borderRadius: '20px',
        background: 'var(--bg3)', border: '1px solid var(--l)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="3" stroke="var(--d3)" strokeWidth="1.5"/>
          <path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="var(--d3)" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="17" cy="8" r="2.5" stroke="var(--d3)" strokeWidth="1.5"/>
          <path d="M21 20c0-2.761-1.791-5-4-5" stroke="var(--d3)" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      <div style={{ fontSize: 17, fontWeight: 500, color: 'var(--d1)', marginBottom: 10, letterSpacing: '-0.02em' }}>
        {exhausted ? 'Посмотрел всех' : 'Скоро здесь появятся люди'}
      </div>
      <div style={{ fontSize: 14, color: 'var(--d3)', textAlign: 'center', lineHeight: 1.6, maxWidth: 240 }}>
        {exhausted
          ? 'Алгоритм подберёт новых кандидатов. Загляни позже.'
          : 'Добавь фото — и алгоритм подберёт подходящих людей с совместимостью в процентах'}
      </div>
      <button onClick={onBack} style={{
        marginTop: 32, padding: '13px 28px', background: 'var(--w)',
        color: 'var(--bg)', border: 'none', borderRadius: 12,
        fontFamily: 'Inter', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>
        Вернуться в чат
      </button>
    </div>
  )
}
