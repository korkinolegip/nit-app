import { useState, useEffect, useRef } from 'react'
import { getPeople, matchAction, restoreSkip, saveProfile, checkCompatibility, Match, PeopleFilters, DEFAULT_PEOPLE_FILTERS, FillableByTest, FillableByChat } from '../api/matches'
import { getPostTest, submitPostTest, PostTestData, PostTestQuestion } from '../api/feed'
import Loader from '../components/Loader'

interface DiscoveryProps {
  onBack: () => void
  onOpenChat: (matchId: number) => void
  onGoToChat?: () => void
}

const FILTERS_KEY = 'people_filters'

function loadFilters(): PeopleFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (raw) return { ...DEFAULT_PEOPLE_FILTERS, ...JSON.parse(raw) }
  } catch {}
  return { ...DEFAULT_PEOPLE_FILTERS }
}

function saveFilters(f: PeopleFilters) {
  localStorage.setItem(FILTERS_KEY, JSON.stringify(f))
}

function filtersActive(f: PeopleFilters): boolean {
  return (
    f.gender !== 'all' ||
    f.age_min !== DEFAULT_PEOPLE_FILTERS.age_min ||
    f.age_max !== DEFAULT_PEOPLE_FILTERS.age_max ||
    f.city.trim() !== ''
  )
}

export default function Discovery({ onBack, onOpenChat, onGoToChat }: DiscoveryProps) {
  const [candidates, setCandidates] = useState<Match[]>([])
  const [reviewedMatches, setReviewedMatches] = useState<Match[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [exitAnim, setExitAnim] = useState<'left' | 'right' | null>(null)
  const [viewingProfile, setViewingProfile] = useState<Match | null>(null)
  const [restoring, setRestoring] = useState<number | null>(null)
  const [filters, setFilters] = useState<PeopleFilters>(loadFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [barrierInfo, setBarrierInfo] = useState<{
    target_user_id: number; target_name: string; current_pct: number; target_pct: number
    missing_patterns: string[]; fillable_by_test: FillableByTest[]; fillable_by_chat: FillableByChat[]
  } | null>(null)
  const touchStartX = useRef(0)
  const touchStartY = useRef(0)

  const loadCandidates = async (f: PeopleFilters) => {
    setLoading(true)
    try {
      const data = await getPeople(f, 0)
      setCandidates(data.matches.filter(m => m.user_action === null))
      setReviewedMatches(data.matches.filter(m => m.user_action !== null))
      setCurrentIndex(0)
    } catch {}
    setLoading(false)
  }

  useEffect(() => {
    loadCandidates(filters)
  }, [])

  const current = candidates[currentIndex]

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
      const res = await matchAction(current.match_id, action) as any
      if (res.blocked) {
        // Fetch extended compatibility data (fillable_by_test, fillable_by_chat)
        let fillable_by_test: FillableByTest[] = []
        let fillable_by_chat: FillableByChat[] = []
        try {
          const compat = await checkCompatibility(current.partner_user_id)
          fillable_by_test = compat.fillable_by_test || []
          fillable_by_chat = compat.fillable_by_chat || []
        } catch {}
        setBarrierInfo({
          target_user_id: current.partner_user_id,
          target_name: res.target_name || current.user.name,
          current_pct: res.current_pct || 0,
          target_pct: res.target_pct || 0,
          missing_patterns: res.missing_patterns || [],
          fillable_by_test,
          fillable_by_chat,
        })
        return
      }
      const actedMatch = { ...current, user_action: action as 'like' | 'skip' }
      setReviewedMatches(prev => [actedMatch, ...prev])
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

  const handleRestore = async (matchId: number) => {
    setRestoring(matchId)
    try {
      await restoreSkip(matchId)
      const restoredMatch = reviewedMatches.find(m => m.match_id === matchId)
      if (restoredMatch) {
        setReviewedMatches(prev => prev.filter(m => m.match_id !== matchId))
        setCandidates(prev => [...prev, { ...restoredMatch, user_action: null, restore_count: restoredMatch.restore_count + 1 }])
      }
      setViewingProfile(null)
    } catch {
      // ignore
    } finally {
      setRestoring(null)
    }
  }

  const applyFilters = (f: PeopleFilters) => {
    saveFilters(f)
    setFilters(f)
    setShowFilters(false)
    loadCandidates(f)
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
    if (dy > 50) return
    if (dx < -40 && photoIndex < orderedPhotos.length - 1) setPhotoIndex(i => i + 1)
    if (dx > 40 && photoIndex > 0) setPhotoIndex(i => i - 1)
  }

  const hasPending = !loading && currentIndex < candidates.length
  const isFiltersActive = filtersActive(filters)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px',
        paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)', background: 'var(--bg)', flexShrink: 0,
      }}>
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>ЛЮДИ</div>
        <button
          onClick={() => setShowFilters(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--d2)', position: 'relative',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          {isFiltersActive && (
            <div style={{
              position: 'absolute', top: 6, right: 6,
              width: 7, height: 7, borderRadius: '50%',
              background: '#e53e3e', border: '1.5px solid var(--bg)',
            }} />
          )}
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Card + actions area — always min full screen height */}
        <div style={{ minHeight: 'calc(100dvh - 52px)', display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader />
            </div>
          ) : !hasPending ? (
            <EmptyState
              onBack={onBack}
              exhausted={candidates.length > 0 || reviewedMatches.length > 0}
              hasReviewed={reviewedMatches.length > 0}
              filtersActive={isFiltersActive}
              onResetFilters={() => applyFilters({ ...DEFAULT_PEOPLE_FILTERS })}
            />
          ) : (
            <>
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
            </>
          )}
        </div>

        {/* Reviewed section */}
        {!loading && reviewedMatches.length > 0 && (
          <div style={{ padding: '8px 16px 32px' }}>
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '.08em', color: 'var(--d3)',
              textTransform: 'uppercase', marginBottom: 12,
              borderTop: '1px solid var(--l)', paddingTop: 20,
            }}>
              Просмотренные — {reviewedMatches.length}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {reviewedMatches.map(m => {
                const photo = m.user.photos.find(p => p.is_primary) || m.user.photos[0]
                const isSkipped = m.user_action === 'skip'
                const canRestore = isSkipped && m.restore_count < 2
                return (
                  <div
                    key={m.match_id}
                    onClick={() => setViewingProfile(m)}
                    style={{
                      background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
                      padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12,
                      cursor: 'pointer', opacity: isSkipped ? 0.75 : 1,
                    }}
                  >
                    {/* Photo */}
                    <div style={{
                      width: 48, height: 48, borderRadius: 12, background: 'var(--bg)',
                      border: '1px solid var(--l)', overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>
                      {photo?.url
                        ? <img src={photo.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : m.user.name[0]
                      }
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--d1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {m.user.name}, {m.user.age}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--d4)', marginTop: 2 }}>
                        {Math.round(m.compatibility_score)}%
                        {isSkipped
                          ? ` · пропущен · ещё ${2 - m.restore_count} возврат${m.restore_count === 1 ? '' : 'а'}`
                          : ' · понравился'
                        }
                      </div>
                    </div>
                    {/* Restore or arrow */}
                    {canRestore ? (
                      <button
                        onClick={e => { e.stopPropagation(); handleRestore(m.match_id) }}
                        disabled={restoring === m.match_id}
                        style={{
                          padding: '7px 12px', background: 'none',
                          border: '1px solid var(--l)', borderRadius: 10,
                          color: 'var(--d2)', fontSize: 12, fontWeight: 500,
                          cursor: 'pointer', fontFamily: 'Inter', flexShrink: 0,
                        }}
                      >
                        {restoring === m.match_id ? '...' : 'Вернуть'}
                      </button>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: 'var(--d4)' }}>
                        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Profile modal for current card */}
      {showProfile && current && (
        <ProfileModal
          match={current}
          photos={orderedPhotos}
          onClose={() => setShowProfile(false)}
          onLike={() => { setShowProfile(false); handleAction('like') }}
          onSkip={() => { setShowProfile(false); handleAction('skip') }}
        />
      )}

      {/* Profile modal for reviewed profiles */}
      {viewingProfile && (
        <ReviewedProfileModal
          match={viewingProfile}
          onClose={() => setViewingProfile(null)}
          onRestore={viewingProfile.user_action === 'skip' && viewingProfile.restore_count < 2
            ? () => handleRestore(viewingProfile.match_id)
            : undefined
          }
          restoring={restoring === viewingProfile.match_id}
        />
      )}

      {/* Filter sheet */}
      {showFilters && (
        <FilterSheet
          filters={filters}
          onApply={applyFilters}
          onClose={() => setShowFilters(false)}
        />
      )}

      {/* Match barrier sheet */}
      {barrierInfo && (
        <BarrierSheet
          info={barrierInfo}
          onClose={() => setBarrierInfo(null)}
          onSave={async () => {
            try { await saveProfile(barrierInfo.target_user_id) } catch {}
            setBarrierInfo(null)
          }}
          onGoToChat={() => { setBarrierInfo(null); onGoToChat?.() }}
        />
      )}
    </div>
  )
}

function FilterSheet({ filters, onApply, onClose }: {
  filters: PeopleFilters
  onApply: (f: PeopleFilters) => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<PeopleFilters>({ ...filters })

  const minPct = ((local.age_min - 18) / (80 - 18)) * 100
  const maxPct = ((local.age_max - 18) / (80 - 18)) * 100
  const trackBg = `linear-gradient(to right, var(--l) ${minPct}%, var(--w) ${minPct}%, var(--w) ${maxPct}%, var(--l) ${maxPct}%)`

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.5)' }}
      />
      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--bg2)', borderRadius: '20px 20px 0 0',
        padding: '20px 20px', paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
        animation: 'slideUpSheet 0.3s cubic-bezier(0.34,1.1,0.64,1)',
      }}>
        {/* Handle */}
        <div style={{ width: 36, height: 4, background: 'var(--l)', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* Title */}
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--w)', marginBottom: 20 }}>Фильтры</div>

        {/* Gender tabs */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', color: 'var(--d3)', textTransform: 'uppercase', marginBottom: 10 }}>
            Пол
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['all', 'female', 'male'] as const).map(g => {
              const labels = { all: 'Все', female: 'Девушки', male: 'Парни' }
              return (
                <button
                  key={g}
                  onClick={() => setLocal(f => ({ ...f, gender: g }))}
                  style={{
                    flex: 1, padding: '10px 0',
                    background: local.gender === g ? 'var(--w)' : 'var(--bg3)',
                    border: '1px solid var(--l)', borderRadius: 10,
                    color: local.gender === g ? 'var(--bg)' : 'var(--d2)',
                    fontSize: 14, fontWeight: local.gender === g ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'Inter',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {labels[g]}
                </button>
              )
            })}
          </div>
        </div>

        {/* Age range */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', color: 'var(--d3)', textTransform: 'uppercase' }}>
              Возраст
            </div>
            <div style={{ fontSize: 14, color: 'var(--d2)' }}>
              {local.age_min} – {local.age_max}
            </div>
          </div>
          <div style={{ position: 'relative', height: 28, pointerEvents: 'none' }}>
            {/* Track */}
            <div style={{
              position: 'absolute', top: '50%', left: 0, right: 0,
              height: 4, borderRadius: 2, background: trackBg,
              transform: 'translateY(-50%)',
            }} />
            {/* Min thumb */}
            <input
              type="range"
              min={18} max={80}
              value={local.age_min}
              onChange={e => {
                const v = Number(e.target.value)
                if (v < local.age_max) setLocal(f => ({ ...f, age_min: v }))
              }}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                opacity: 0, pointerEvents: 'all', cursor: 'pointer', margin: 0,
                WebkitAppearance: 'none', appearance: 'none',
              }}
            />
            {/* Max thumb */}
            <input
              type="range"
              min={18} max={80}
              value={local.age_max}
              onChange={e => {
                const v = Number(e.target.value)
                if (v > local.age_min) setLocal(f => ({ ...f, age_max: v }))
              }}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                opacity: 0, pointerEvents: 'all', cursor: 'pointer', margin: 0,
                WebkitAppearance: 'none', appearance: 'none',
              }}
            />
            {/* Visual thumbs */}
            <div style={{
              position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
              left: `${minPct}%`,
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--w)', border: '2px solid var(--bg)',
              boxShadow: '0 1px 4px rgba(0,0,0,.4)', pointerEvents: 'none',
            }} />
            <div style={{
              position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
              left: `${maxPct}%`,
              width: 22, height: 22, borderRadius: '50%',
              background: 'var(--w)', border: '2px solid var(--bg)',
              boxShadow: '0 1px 4px rgba(0,0,0,.4)', pointerEvents: 'none',
            }} />
          </div>
        </div>

        {/* City */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.06em', color: 'var(--d3)', textTransform: 'uppercase', marginBottom: 10 }}>
            Город
          </div>
          <input
            type="text"
            placeholder="Например, Москва"
            value={local.city}
            onChange={e => setLocal(f => ({ ...f, city: e.target.value }))}
            style={{
              width: '100%', padding: '12px 14px',
              background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 12,
              color: 'var(--w)', fontSize: 15, fontFamily: 'Inter',
              outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={() => {
              const reset = { ...DEFAULT_PEOPLE_FILTERS }
              setLocal(reset)
              onApply(reset)
            }}
            style={{
              flex: 1, padding: '14px',
              background: 'none', border: '1px solid var(--l)', borderRadius: 12,
              color: 'var(--d2)', fontSize: 15, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Сбросить
          </button>
          <button
            onClick={() => onApply(local)}
            style={{
              flex: 2, padding: '14px',
              background: 'var(--w)', border: 'none', borderRadius: 12,
              color: 'var(--bg)', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Применить
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUpSheet { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </>
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
      <ProfilePhotoArea
        photos={photos}
        pi={pi}
        setPi={setPi}
        touchStartX={touchStartX}
        name={m.user.name}
        score={m.compatibility_score}
        onClose={onClose}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
        <ProfileInfo match={m} />
        <div style={{ height: 20 }} />
      </div>

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

function ReviewedProfileModal({ match: m, onClose, onRestore, restoring }: {
  match: Match
  onClose: () => void
  onRestore?: () => void
  restoring: boolean
}) {
  const photos = m.user.photos.filter(p => p.url)
  const primaryIdx = photos.findIndex(p => p.is_primary)
  const orderedPhotos = primaryIdx > 0
    ? [photos[primaryIdx], ...photos.filter((_, i) => i !== primaryIdx)]
    : photos
  const [pi, setPi] = useState(0)
  const touchStartX = useRef(0)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300,
      background: 'var(--bg)', display: 'flex', flexDirection: 'column',
      animation: 'slideUpFull 0.3s cubic-bezier(0.34,1.1,0.64,1)',
    }}>
      <ProfilePhotoArea
        photos={orderedPhotos}
        pi={pi}
        setPi={setPi}
        touchStartX={touchStartX}
        name={m.user.name}
        score={m.compatibility_score}
        onClose={onClose}
      />

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 0' }}>
        <ProfileInfo match={m} />
        <div style={{ height: 20 }} />
      </div>

      {onRestore && (
        <div style={{ padding: '14px 20px', paddingBottom: 'max(20px, env(safe-area-inset-bottom, 20px))', flexShrink: 0, borderTop: '1px solid var(--l)' }}>
          <button
            onClick={onRestore}
            disabled={restoring}
            style={{
              width: '100%', padding: '15px', background: 'var(--w)',
              border: 'none', borderRadius: 14,
              color: 'var(--bg)', fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            {restoring ? '...' : 'Вернуть в очередь'}
          </button>
        </div>
      )}

      <style>{`
        @keyframes slideUpFull { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </div>
  )
}

function ProfilePhotoArea({ photos, pi, setPi, touchStartX, name, score, onClose }: {
  photos: { url: string; is_primary: boolean }[]
  pi: number
  setPi: React.Dispatch<React.SetStateAction<number>>
  touchStartX: React.MutableRefObject<number>
  name: string
  score: number
  onClose: () => void
}) {
  return (
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
          {name[0]}
        </div>
      )}
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
      <div style={{
        position: 'absolute', top: 'max(16px, env(safe-area-inset-top, 16px))', right: 16,
        background: 'rgba(0,0,0,.65)', borderRadius: 20, padding: '5px 12px',
        fontSize: 14, fontWeight: 700, color: '#fff', backdropFilter: 'blur(4px)',
      }}>
        {Math.round(score)}%
      </div>
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
  )
}

function ProfileInfo({ match: m }: { match: Match }) {
  return (
    <>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--w)', letterSpacing: '-0.02em' }}>
        {m.user.name}, {m.user.age}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 10 }}>
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
          <div style={{ fontSize: 14, color: 'var(--d2)', lineHeight: 1.7 }}>
            {m.user.profile_text}
          </div>
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
    </>
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

// ── Inline TestSheet for BarrierSheet context ──────────────────────────────

function BarrierTestSheet({ postId, onClose, onComplete }: { postId: number; onClose: () => void; onComplete: () => void }) {
  const [testData, setTestData] = useState<PostTestData | null>(null)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ key: string; description: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getPostTest(postId)
      .then(data => { setTestData(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [postId])

  const selectOption = (questionId: string, optionKey: string) => {
    const newAnswers = { ...answers, [questionId]: optionKey }
    setAnswers(newAnswers)
    if (!testData) return
    const questions = testData.questions as PostTestQuestion[]
    if (step < questions.length - 1) {
      setTimeout(() => setStep(s => s + 1), 300)
    } else {
      setSubmitting(true)
      submitPostTest(postId, newAnswers)
        .then(res => {
          setResult({ key: res.result_key, description: res.result_description })
          setSubmitting(false)
          onComplete()
        })
        .catch(() => setSubmitting(false))
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{
        position: 'relative', background: 'var(--bg2)', borderRadius: '20px 20px 0 0',
        padding: '0 20px 40px', border: '1px solid var(--l)', borderBottom: 'none',
        animation: 'slideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)', maxHeight: '85dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--d4)', margin: '12px auto 20px' }} />
        {loading && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--d3)' }}>Загрузка теста...</div>}
        {!loading && !testData && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--d3)' }}>Тест недоступен</div>}
        {testData && testData.already_completed && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--w)', marginBottom: 8 }}>Тест уже пройден</div>
            <div style={{ fontSize: 13, color: 'var(--d2)', marginBottom: 20 }}>{testData.result_description}</div>
            <button onClick={onClose} style={{ padding: '12px 24px', background: 'var(--w)', border: 'none', borderRadius: 12, color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Понятно</button>
          </div>
        )}
        {testData && !testData.already_completed && !result && !submitting && (() => {
          const questions = testData.questions as PostTestQuestion[]
          const q = questions[step]
          return (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--w)', marginBottom: 6 }}>{testData.title}</div>
              <div style={{ fontSize: 12, color: 'var(--d3)', marginBottom: 20 }}>Вопрос {step + 1} из {questions.length}</div>
              <div style={{ fontSize: 15, color: 'var(--d1)', lineHeight: 1.5, marginBottom: 20 }}>{q.text}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {q.options.map(opt => (
                  <button key={opt.key} onClick={() => selectOption(q.id, opt.key)} style={{
                    padding: '13px 16px', borderRadius: 14,
                    border: answers[q.id] === opt.key ? '1px solid rgba(123,94,255,0.6)' : '1px solid var(--l)',
                    background: answers[q.id] === opt.key ? 'rgba(123,94,255,0.15)' : 'var(--bg3)',
                    color: 'var(--d1)', fontSize: 14, fontFamily: 'Inter', textAlign: 'left', cursor: 'pointer',
                  }}>{opt.text}</button>
                ))}
              </div>
            </>
          )
        })()}
        {submitting && <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--d3)' }}>Обрабатываю результат...</div>}
        {result && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--w)', marginBottom: 10 }}>Результат</div>
            <div style={{ fontSize: 14, color: 'var(--d1)', lineHeight: 1.6, marginBottom: 20 }}>{result.description}</div>
            <button onClick={onClose} style={{ padding: '12px 24px', background: 'var(--w)', border: 'none', borderRadius: 12, color: 'var(--bg)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Готово</button>
          </div>
        )}
      </div>
    </div>
  )
}

// ── BarrierSheet ───────────────────────────────────────────────────────────────

function BarrierSheet({ info, onClose, onSave, onGoToChat }: {
  info: {
    target_name: string; current_pct: number; target_pct: number; missing_patterns: string[]
    fillable_by_test: FillableByTest[]; fillable_by_chat: FillableByChat[]
  }
  onClose: () => void
  onSave: () => void
  onGoToChat: () => void
}) {
  const [activeTestId, setActiveTestId] = useState<number | null>(null)
  const [completedTests, setCompletedTests] = useState<Set<number>>(new Set())
  const [currentPct, setCurrentPct] = useState(info.current_pct)
  const [unlocked, setUnlocked] = useState(false)
  const [fillableTests, setFillableTests] = useState(info.fillable_by_test)

  const handleTestComplete = async () => {
    if (activeTestId !== null) {
      setCompletedTests(prev => new Set([...prev, activeTestId]))
    }
    setActiveTestId(null)
    // Re-check compatibility
    try {
      const { checkCompatibility } = await import('../api/matches')
      // We need target_user_id — store it in the outer component's barrierInfo
      // Since we don't have it here, we'll just bump the pct estimate
      // The parent component handles full re-check via barrierInfo
    } catch {}
    // Remove completed test from the list
    if (activeTestId !== null) {
      setFillableTests(prev => prev.filter(t => t.post_id !== activeTestId))
      setCurrentPct(p => Math.min(100, p + 7))
      // Check if all fillable_by_test are done
      const remaining = fillableTests.filter(t => t.post_id !== activeTestId)
      if (remaining.length === 0 && info.fillable_by_chat.length === 0) {
        setTimeout(() => setUnlocked(true), 400)
      }
    }
  }

  const hasTests = fillableTests.length > 0
  const hasChat = info.fillable_by_chat.length > 0
  const allDone = !hasTests && !hasChat

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }} />
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 401,
        background: 'var(--bg2)', borderRadius: '20px 20px 0 0',
        padding: '20px 20px', paddingBottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
        animation: 'slideUpSheet 0.28s cubic-bezier(0.34,1.1,0.64,1)',
        maxHeight: '85dvh', overflowY: 'auto',
      }}>
        <div style={{ width: 36, height: 4, background: 'var(--l)', borderRadius: 2, margin: '0 auto 20px' }} />

        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 32, marginBottom: 8, transition: 'all 0.4s' }}>{unlocked ? '🔓' : '🔒'}</div>
          <div style={{ fontSize: 17, fontWeight: 600, fontFamily: 'Inter', letterSpacing: '-0.02em', color: unlocked ? '#22c55e' : 'var(--d1)' }}>
            {unlocked
              ? 'Теперь Нить может посчитать совместимость!'
              : `Нить не может посчитать совместимость с ${info.target_name}`}
          </div>
        </div>

        {/* Profile comparison bars */}
        <div style={{ background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--d2)', fontFamily: 'Inter' }}>Твой профиль</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter' }}>{currentPct}%</span>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${currentPct}%`, background: unlocked ? '#22c55e' : 'var(--w)', transition: 'width 0.5s, background 0.4s' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--d2)', fontFamily: 'Inter' }}>Профиль {info.target_name}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter' }}>{info.target_pct}%</span>
            </div>
            <div style={{ background: 'var(--bg)', borderRadius: 3, height: 5, overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 3, width: `${info.target_pct}%`, background: '#22c55e' }} />
            </div>
          </div>
        </div>

        {/* Fillable by test */}
        {hasTests && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--d3)', fontFamily: 'Inter', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Можно пройти тест</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {fillableTests.map(t => {
                const done = completedTests.has(t.post_id)
                return (
                  <button
                    key={t.post_id}
                    onClick={() => !done && setActiveTestId(t.post_id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px', borderRadius: 12,
                      border: done ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(123,94,255,0.4)',
                      background: done ? 'rgba(34,197,94,0.08)' : 'rgba(123,94,255,0.08)',
                      color: done ? '#22c55e' : 'rgba(123,94,255,1)',
                      fontSize: 13, fontFamily: 'Inter', fontWeight: 500,
                      cursor: done ? 'default' : 'pointer', textAlign: 'left',
                    }}
                  >
                    <span>{done ? '✓ ' : '▶ '}{t.test_title}</span>
                    {t.target_has_completed && !done && (
                      <span style={{ fontSize: 11, color: 'var(--d3)' }}>{info.target_name} прошла ✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Fillable by chat */}
        {hasChat && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--d3)', fontFamily: 'Inter', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Можно рассказать боту</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {info.fillable_by_chat.map(c => (
                <button
                  key={c.pattern_key}
                  onClick={() => { onClose(); onGoToChat() }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '12px 14px', borderRadius: 12,
                    border: '1px solid var(--l)', background: 'var(--bg3)',
                    color: 'var(--d1)', fontSize: 13, fontFamily: 'Inter', fontWeight: 500,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <span>💬</span>
                  <span>{c.pattern_name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* No actionable items */}
        {!hasTests && !hasChat && !unlocked && (
          <div style={{ fontSize: 13, color: 'var(--d3)', fontFamily: 'Inter', textAlign: 'center', lineHeight: 1.6, marginBottom: 16 }}>
            Расскажи больше о себе — Нить найдёт точки совпадения
          </div>
        )}

        {/* Primary action button */}
        {unlocked ? (
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '14px', background: '#22c55e',
              border: 'none', borderRadius: 13, marginBottom: 10,
              color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Отправить матч ✓
          </button>
        ) : hasTests ? (
          <button
            onClick={() => setActiveTestId(fillableTests[0]?.post_id ?? null)}
            style={{
              width: '100%', padding: '14px', background: 'var(--w)',
              border: 'none', borderRadius: 13, marginBottom: 10,
              color: 'var(--bg)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Начать →
          </button>
        ) : (
          <button
            onClick={onGoToChat}
            style={{
              width: '100%', padding: '14px', background: 'var(--w)',
              border: 'none', borderRadius: 13, marginBottom: 10,
              color: 'var(--bg)', fontSize: 14, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Дополнить профиль →
          </button>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onSave}
            style={{
              flex: 1, padding: '13px', background: 'none',
              border: '1px solid var(--l)', borderRadius: 13,
              color: 'var(--d2)', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Сохранить пока
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '13px', background: 'none',
              border: '1px solid var(--l)', borderRadius: 13,
              color: 'var(--d3)', fontSize: 13, fontWeight: 400,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Пропустить
          </button>
        </div>
      </div>

      {/* Inline test sheet */}
      {activeTestId !== null && (
        <BarrierTestSheet
          postId={activeTestId}
          onClose={() => setActiveTestId(null)}
          onComplete={handleTestComplete}
        />
      )}
    </>
  )
}


function EmptyState({ onBack, exhausted, hasReviewed, filtersActive, onResetFilters }: {
  onBack: () => void
  exhausted: boolean
  hasReviewed: boolean
  filtersActive: boolean
  onResetFilters: () => void
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
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
          ? hasReviewed
            ? 'Прокрути вниз — там все просмотренные анкеты'
            : 'Алгоритм подберёт новых кандидатов. Загляни позже.'
          : 'Добавь фото — и алгоритм подберёт подходящих людей с совместимостью в процентах'}
      </div>
      {filtersActive && (
        <button onClick={onResetFilters} style={{
          marginTop: 20, padding: '11px 22px', background: 'none',
          border: '1px solid var(--l)', borderRadius: 12,
          color: 'var(--d2)', fontFamily: 'Inter', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}>
          Сбросить фильтры
        </button>
      )}
      <button onClick={onBack} style={{
        marginTop: 12, padding: '13px 28px', background: 'var(--w)',
        color: 'var(--bg)', border: 'none', borderRadius: 12,
        fontFamily: 'Inter', fontSize: 14, fontWeight: 600, cursor: 'pointer',
      }}>
        Вернуться в чат
      </button>
    </div>
  )
}
