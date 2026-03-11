import { useState, useEffect, useRef } from 'react'
import { getMyViewers, getIViewed, markViewsSeen, ProfileViewer } from '../api/views'
import { getUserById, likeUser, PublicUserProfile } from '../api/matches'
import Loader from '../components/Loader'

interface ProfileViewsProps {
  onBack: () => void
  onOpenMatch?: (matchId: number) => void
}

type Tab = 'viewers' | 'viewed'

function formatDate(isoString: string): string {
  const d = new Date(isoString)
  const now = new Date()
  const diff = (now.getTime() - d.getTime()) / 1000

  if (diff < 60) return 'только что'
  if (diff < 3600) return `${Math.floor(diff / 60)} мин. назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч. назад`
  if (diff < 86400 * 2) return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function formatDuration(sec: number | null): string | null {
  if (!sec) return null
  if (sec < 10) return 'быстрый взгляд'
  if (sec < 30) return `${sec} сек`
  if (sec < 60) return 'около минуты'
  return `${Math.round(sec / 60)} мин`
}

function matchText(myGender: string | null, partnerGender: string | null): string {
  if (myGender && partnerGender && myGender !== partnerGender) {
    return 'Взаимная симпатия! Самое время познакомиться поближе.'
  }
  return 'Вы понравились друг другу! Открывай чат.'
}

export default function ProfileViews({ onBack, onOpenMatch }: ProfileViewsProps) {
  const [tab, setTab] = useState<Tab>('viewers')
  const [viewers, setViewers] = useState<ProfileViewer[]>([])
  const [viewed, setViewed] = useState<ProfileViewer[]>([])
  const [loading, setLoading] = useState(true)

  // Profile modal state (for viewer cards without match_id)
  const [viewingProfile, setViewingProfile] = useState<PublicUserProfile | null>(null)
  const [viewingItem, setViewingItem] = useState<ProfileViewer | null>(null)
  const [profileLoading, setProfileLoading] = useState(false)
  const [liking, setLiking] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)

  // Match overlay state
  const [matchOverlay, setMatchOverlay] = useState<{
    text: string
    matchChatId: number | null
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const [v1, v2] = await Promise.all([getMyViewers(), getIViewed()])
        setViewers(v1.views)
        setViewed(v2.views)
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    load()
    markViewsSeen().catch(() => {})
  }, [])

  const currentList = tab === 'viewers' ? viewers : viewed

  const openProfile = async (item: ProfileViewer) => {
    setViewingItem(item)
    setPhotoIndex(0)
    setProfileLoading(true)
    try {
      const profile = await getUserById(item.user_id)
      setViewingProfile(profile)
    } catch {
      // ignore
    } finally {
      setProfileLoading(false)
    }
  }

  const handleLike = async () => {
    if (!viewingItem || liking) return
    setLiking(true)
    try {
      const res = await likeUser(viewingItem.user_id)
      // Update match_id in the list
      const updateList = (list: ProfileViewer[]) =>
        list.map(v => v.user_id === viewingItem.user_id ? { ...v, match_id: res.match_id } : v)
      setViewers(updateList)
      setViewed(updateList)

      if (res.mutual_match && res.match_chat_id) {
        setViewingProfile(null)
        setViewingItem(null)
        setMatchOverlay({
          text: matchText(res.my_gender ?? null, res.partner_gender ?? null),
          matchChatId: res.match_chat_id,
        })
      } else {
        // Just close the profile modal
        setViewingProfile(null)
        setViewingItem(null)
      }
    } catch {
      // ignore
    } finally {
      setLiking(false)
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
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>ПРОСМОТРЫ</div>
        <div style={{ width: 32 }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', padding: '12px 16px 0', gap: 8, flexShrink: 0 }}>
        {([
          { key: 'viewers' as const, label: 'Смотрели меня', count: viewers.length },
          { key: 'viewed' as const, label: 'Я смотрел(а)', count: viewed.length },
        ]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '10px 8px',
              background: tab === t.key ? 'var(--w)' : 'var(--bg3)',
              border: tab === t.key ? 'none' : '1px solid var(--l)',
              borderRadius: 12,
              color: tab === t.key ? 'var(--bg)' : 'var(--d2)',
              fontFamily: 'Inter', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            {t.label} {t.count > 0 && `(${t.count})`}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {loading ? (
          <Loader />
        ) : currentList.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80, color: 'var(--d3)' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>👁</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--d2)', marginBottom: 8 }}>
              {tab === 'viewers' ? 'Пока никто не заходил' : 'Ты ещё никого не смотрел(а)'}
            </div>
            <div style={{ fontSize: 14, lineHeight: 1.6 }}>
              {tab === 'viewers'
                ? 'Просмотры появятся когда кто-то откроет твой профиль'
                : 'Просмотри профили в матчах — они появятся здесь'
              }
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {currentList.map(item => (
              <ViewerCard
                key={item.view_id}
                item={item}
                onOpenMatch={onOpenMatch}
                onViewProfile={openProfile}
              />
            ))}
          </div>
        )}
      </div>

      {/* Profile modal — viewer without match_id */}
      {(viewingProfile || profileLoading) && viewingItem && (
        <ProfileModal
          profile={viewingProfile}
          loading={profileLoading}
          liking={liking}
          photoIndex={photoIndex}
          setPhotoIndex={setPhotoIndex}
          onClose={() => { setViewingProfile(null); setViewingItem(null) }}
          onLike={handleLike}
        />
      )}

      {/* Match overlay */}
      {matchOverlay && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 200,
          background: 'rgba(0,0,0,.85)', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 32, textAlign: 'center',
        }}>
          <div style={{ fontSize: 56, marginBottom: 20 }}>💛</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--w)', marginBottom: 12 }}>
            Взаимно!
          </div>
          <div style={{ fontSize: 15, color: 'var(--d2)', lineHeight: 1.6, marginBottom: 32 }}>
            {matchOverlay.text}
          </div>
          {matchOverlay.matchChatId && onOpenMatch && (
            <button
              onClick={() => {
                const id = matchOverlay.matchChatId!
                setMatchOverlay(null)
                onOpenMatch(id)
              }}
              style={{
                padding: '14px 36px', background: 'var(--w)', border: 'none',
                borderRadius: 14, color: 'var(--bg)', fontSize: 15, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'Inter', marginBottom: 12,
              }}
            >
              Открыть чат
            </button>
          )}
          <button
            onClick={() => setMatchOverlay(null)}
            style={{
              padding: '12px 24px', background: 'none', border: '1px solid var(--l)',
              borderRadius: 12, color: 'var(--d2)', fontSize: 14, cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Позже
          </button>
        </div>
      )}
    </div>
  )
}

function ViewerCard({
  item,
  onOpenMatch,
  onViewProfile,
}: {
  item: ProfileViewer
  onOpenMatch?: (matchId: number) => void
  onViewProfile: (item: ProfileViewer) => void
}) {
  const durationText = formatDuration(item.duration_seconds)
  const hasMatch = !!item.match_id

  const handleClick = () => {
    if (hasMatch && onOpenMatch) {
      onOpenMatch(item.match_id!)
    } else {
      onViewProfile(item)
    }
  }

  return (
    <div
      onClick={handleClick}
      style={{
        background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
        padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer',
      }}
    >
      {/* Avatar */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{
          width: 52, height: 52, borderRadius: 14, background: 'var(--bg)',
          border: '1px solid var(--l)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: 'var(--d3)',
        }}>
          {item.photo_url
            ? <img src={item.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : (item.name?.[0] ?? '?')
          }
        </div>
        {item.is_online && (
          <div style={{
            position: 'absolute', bottom: 2, right: 2,
            width: 10, height: 10, borderRadius: '50%',
            background: '#22c55e', border: '2px solid var(--bg3)',
          }} />
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--w)', marginBottom: 2 }}>
          {item.name}{item.age ? `, ${item.age}` : ''}
        </div>
        <div style={{ fontSize: 12, color: 'var(--d3)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {item.city && <span>{item.city}</span>}
          {item.city && (item.last_seen_text || item.is_online) && <span>·</span>}
          {item.is_online
            ? <span style={{ color: '#22c55e' }}>онлайн</span>
            : item.last_seen_text && <span>{item.last_seen_text}</span>
          }
        </div>
        {durationText && (
          <div style={{ fontSize: 11, color: 'var(--d4)', marginTop: 3 }}>
            Смотрел(а) {durationText}
          </div>
        )}
      </div>

      {/* Right side */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <div style={{ fontSize: 11, color: 'var(--d4)', textAlign: 'right' }}>
          {formatDate(item.seen_at)}
        </div>
        {/* Icon: chat if matched, heart if no match yet, chevron for viewed-by-me */}
        {hasMatch ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--d3)' }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--d3)' }}>
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>
    </div>
  )
}

function ProfileModal({
  profile,
  loading,
  liking,
  photoIndex,
  setPhotoIndex,
  onClose,
  onLike,
}: {
  profile: PublicUserProfile | null
  loading: boolean
  liking: boolean
  photoIndex: number
  setPhotoIndex: (i: number) => void
  onClose: () => void
  onLike: () => void
}) {
  const photos = profile?.photos ?? []
  const photo = photos[photoIndex]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: 'var(--bg)',
      display: 'flex', flexDirection: 'column', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)', flexShrink: 0,
      }}>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--d2)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>ПРОФИЛЬ</div>
        <div style={{ width: 32 }} />
      </div>

      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Loader />
        </div>
      ) : profile ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {/* Photo */}
          {photos.length > 0 && (
            <div style={{ position: 'relative', width: '100%', aspectRatio: '4/5', background: 'var(--bg3)' }}>
              <img
                src={photo?.url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              {photos.length > 1 && (
                <>
                  <div style={{
                    position: 'absolute', top: 12, left: 0, right: 0,
                    display: 'flex', justifyContent: 'center', gap: 5,
                  }}>
                    {photos.map((_, i) => (
                      <div key={i} style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: i === photoIndex ? '#fff' : 'rgba(255,255,255,.4)',
                      }} />
                    ))}
                  </div>
                  {photoIndex > 0 && (
                    <div
                      onClick={() => setPhotoIndex(photoIndex - 1)}
                      style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%', cursor: 'pointer' }}
                    />
                  )}
                  {photoIndex < photos.length - 1 && (
                    <div
                      onClick={() => setPhotoIndex(photoIndex + 1)}
                      style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%', cursor: 'pointer' }}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {/* Info */}
          <div style={{ padding: '16px 16px 100px' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--w)', marginBottom: 4 }}>
              {profile.name}{profile.age ? `, ${profile.age}` : ''}
            </div>
            <div style={{ fontSize: 13, color: profile.is_online ? '#22c55e' : 'var(--d3)', marginBottom: 16 }}>
              {profile.is_online ? 'онлайн' : (profile.last_seen_text ?? profile.city ?? '')}
              {!profile.is_online && profile.city && profile.last_seen_text && ` · ${profile.city}`}
            </div>

            {profile.profile_text && (
              <div style={{
                fontSize: 14, lineHeight: 1.65, color: 'var(--d2)',
                background: 'var(--bg3)', border: '1px solid var(--l)',
                borderRadius: 14, padding: '12px 14px', marginBottom: 16,
              }}>
                {profile.profile_text}
              </div>
            )}

            {profile.goal && (
              <div style={{ fontSize: 13, color: 'var(--d3)', marginBottom: 8 }}>
                🎯 {profile.goal}
              </div>
            )}

            {profile.occupation && (
              <div style={{ fontSize: 13, color: 'var(--d3)', marginBottom: 8 }}>
                💼 {profile.occupation}
              </div>
            )}

            {profile.personality_type && (
              <div style={{
                display: 'inline-block', fontSize: 12, color: 'var(--d3)',
                border: '1px solid var(--l)', borderRadius: 8,
                padding: '4px 10px', marginBottom: 8,
              }}>
                {profile.personality_type}
              </div>
            )}

            {profile.strengths.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {profile.strengths.map((s, i) => (
                  <span key={i} style={{
                    fontSize: 12, color: 'var(--d3)', background: 'var(--bg3)',
                    border: '1px solid var(--l)', borderRadius: 8, padding: '4px 10px',
                  }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* Like button — fixed at bottom */}
      {!loading && profile && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom, 0px))',
          background: 'var(--bg)', borderTop: '1px solid var(--l)',
        }}>
          <button
            onClick={onLike}
            disabled={liking}
            style={{
              width: '100%', padding: '14px', background: liking ? 'var(--bg3)' : 'var(--w)',
              border: 'none', borderRadius: 14,
              color: liking ? 'var(--d3)' : 'var(--bg)',
              fontSize: 15, fontWeight: 700, cursor: liking ? 'default' : 'pointer', fontFamily: 'Inter',
            }}
          >
            {liking ? 'Отправляем...' : '💛 Нравится'}
          </button>
        </div>
      )}
    </div>
  )
}
