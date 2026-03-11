import { useState, useEffect } from 'react'
import { getSavedProfiles, likeUser, SavedProfile } from '../api/matches'

interface SavedProfilesProps {
  onBack: () => void
  onGoToChat: () => void
  onOpenChat: (matchId: number) => void
}

export default function SavedProfiles({ onBack, onGoToChat, onOpenChat }: SavedProfilesProps) {
  const [saved, setSaved] = useState<SavedProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    getSavedProfiles()
      .then(data => setSaved(data.saved))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const handleLike = async (profile: SavedProfile) => {
    if (acting !== null) return
    setActing(profile.target_id)
    try {
      const res = await likeUser(profile.target_id)
      if (res.blocked) {
        showToast('Профиль ещё недостаточно заполнен для матча')
        return
      }
      setSaved(prev => prev.filter(p => p.target_id !== profile.target_id))
      if (res.mutual_match && res.match_chat_id) {
        setTimeout(() => onOpenChat(res.match_chat_id!), 300)
      } else {
        showToast(`Матч с ${profile.name} отправлен!`)
      }
    } catch {
      showToast('Не удалось отправить матч')
    } finally {
      setActing(null)
    }
  }

  const pctColor = (pct: number) =>
    pct >= 90 ? '#22c55e' : pct >= 70 ? '#3b82f6' : pct >= 40 ? '#f59e0b' : 'var(--d3)'

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
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>ОТЛОЖЕННЫЕ</div>
        <div style={{ width: 32 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 32px' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60, color: 'var(--d3)', fontSize: 13 }}>
            Загружаю...
          </div>
        ) : saved.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', paddingTop: 80, gap: 12,
          }}>
            <div style={{ fontSize: 40 }}>🗂</div>
            <div style={{ fontSize: 16, fontWeight: 500, color: 'var(--d2)', fontFamily: 'Inter' }}>
              Нет отложенных профилей
            </div>
            <div style={{ fontSize: 13, color: 'var(--d3)', fontFamily: 'Inter', textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
              Когда ты сохраняешь профиль из-за барьера совместимости — он появится здесь
            </div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--d3)', fontFamily: 'Inter', marginBottom: 14, lineHeight: 1.6 }}>
              Нить уведомит тебя, когда профиль будет достаточно заполнен для матча
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {saved.map(profile => (
                <div key={profile.target_id} style={{
                  background: 'var(--bg3)', border: '1px solid var(--l)',
                  borderRadius: 16, padding: '14px 16px',
                }}>
                  {/* User info row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <div style={{
                      width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                      background: 'var(--bg)', border: '1px solid var(--l)',
                      overflow: 'hidden', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 22, color: 'var(--d3)',
                    }}>
                      {profile.avatar_url
                        ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : profile.name[0]
                      }
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--d1)', fontFamily: 'Inter', letterSpacing: '-0.01em' }}>
                        {profile.name}{profile.age ? `, ${profile.age}` : ''}
                      </div>
                      {profile.city && (
                        <div style={{ fontSize: 12, color: 'var(--d3)', marginTop: 2 }}>{profile.city}</div>
                      )}
                    </div>
                    {profile.can_like && (
                      <div style={{
                        background: 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)',
                        borderRadius: 20, padding: '4px 10px', fontSize: 11, fontWeight: 600,
                        color: '#22c55e', flexShrink: 0,
                      }}>
                        Разблокирован
                      </div>
                    )}
                  </div>

                  {/* Progress comparison */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--d3)', fontFamily: 'Inter' }}>Твой профиль</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--d2)', fontFamily: 'Inter' }}>{profile.current_pct}%</span>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${profile.current_pct}%`, background: pctColor(profile.current_pct), transition: 'width 0.3s' }} />
                      </div>
                    </div>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 11, color: 'var(--d3)', fontFamily: 'Inter' }}>Профиль {profile.name}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--d2)', fontFamily: 'Inter' }}>{profile.target_pct}%</span>
                      </div>
                      <div style={{ background: 'var(--bg)', borderRadius: 3, height: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 3, width: `${profile.target_pct}%`, background: '#22c55e' }} />
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {profile.can_like ? (
                      <button
                        onClick={() => handleLike(profile)}
                        disabled={acting === profile.target_id}
                        style={{
                          flex: 2, padding: '12px', background: 'var(--w)',
                          border: 'none', borderRadius: 12,
                          color: 'var(--bg)', fontSize: 13, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'Inter',
                          opacity: acting === profile.target_id ? 0.6 : 1,
                        }}
                      >
                        {acting === profile.target_id ? '...' : 'Отправить матч'}
                      </button>
                    ) : (
                      <button
                        onClick={onGoToChat}
                        style={{
                          flex: 2, padding: '12px', background: 'none',
                          border: '1px solid var(--l)', borderRadius: 12,
                          color: 'var(--d2)', fontSize: 13, fontWeight: 500,
                          cursor: 'pointer', fontFamily: 'Inter',
                        }}
                      >
                        Дополнить профиль →
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
          left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg3)', border: '1px solid var(--l)',
          borderRadius: 12, padding: '10px 18px',
          fontSize: 13, color: 'var(--d1)', fontFamily: 'Inter',
          boxShadow: '0 4px 20px rgba(0,0,0,.4)', zIndex: 500,
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
