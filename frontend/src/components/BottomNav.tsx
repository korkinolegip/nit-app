import { useState, useRef, useCallback } from 'react'

type MainTab = 'feed' | 'discovery' | 'matches' | 'profile'

interface BottomNavProps {
  activeTab: MainTab
  onTabChange: (tab: 'feed' | 'discovery' | 'chat' | 'matches' | 'profile') => void
  badges?: { matches?: number; views?: number }
  isAdmin?: boolean
  hidden?: boolean
  onNavigateTo: (screen: string) => void
  onOpenSettings: () => void
  isPaused?: boolean
  onTogglePause?: () => void
}

function NavTab({
  icon, label, active, badge, onClick, onTouchStart, onTouchEnd, onMouseDown, onMouseUp,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  badge?: number
  onClick?: () => void
  onTouchStart?: () => void
  onTouchEnd?: () => void
  onMouseDown?: () => void
  onMouseUp?: () => void
}) {
  return (
    <button
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 3, paddingTop: 8, paddingBottom: 2,
        background: 'none', border: 'none', cursor: 'pointer',
        color: active ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.38)',
        transition: 'color 0.15s',
        position: 'relative', WebkitTapHighlightColor: 'transparent',
        outline: 'none',
      }}
    >
      <div style={{ position: 'relative' }}>
        {icon}
        {badge != null && badge > 0 && (
          <div style={{
            position: 'absolute', top: -4, right: -6,
            background: '#ff4466', color: '#fff',
            borderRadius: 20, minWidth: 16, height: 16,
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1,
          }}>
            {badge > 9 ? '9+' : badge}
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, fontFamily: 'Inter', fontWeight: active ? 600 : 400, letterSpacing: '-0.01em' }}>
        {label}
      </span>
    </button>
  )
}

export default function BottomNav({
  activeTab, onTabChange, badges = {}, isAdmin = false,
  hidden = false, onNavigateTo, onOpenSettings, isPaused = false, onTogglePause,
}: BottomNavProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false)
  const [pauseLoading, setPauseLoading] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressTriggered = useRef(false)

  const startLongPress = useCallback(() => {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      setContextMenuOpen(true)
    }, 500)
  }, [])

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const handleProfileTouchEnd = useCallback(() => {
    cancelLongPress()
    // If long press was triggered, don't also navigate
    if (!longPressTriggered.current) {
      onTabChange('profile')
    }
  }, [cancelLongPress, onTabChange])

  const handleProfileClick = useCallback(() => {
    if (!longPressTriggered.current) {
      onTabChange('profile')
    }
  }, [onTabChange])

  const handleTogglePause = async () => {
    if (!onTogglePause) return
    setPauseLoading(true)
    try { await onTogglePause() } finally { setPauseLoading(false) }
    setContextMenuOpen(false)
  }

  if (hidden) return null

  const matchBadge = (badges.matches || 0)

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg2, #13111a)',
        borderTop: '1px solid var(--l, rgba(255,255,255,0.08))',
        display: 'flex', alignItems: 'stretch',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        zIndex: 40,
      }}>
        {/* Лента */}
        <NavTab
          active={activeTab === 'feed'}
          label="Лента"
          onClick={() => onTabChange('feed')}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="18" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="3" y="10" width="11" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
              <rect x="3" y="17" width="14" height="4" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          }
        />

        {/* Люди */}
        <NavTab
          active={activeTab === 'discovery'}
          label="Люди"
          onClick={() => onTabChange('discovery')}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M21 20c0-2.761-1.791-5-4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />

        {/* Нить (center) */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          paddingTop: 6, paddingBottom: 2,
        }}>
          <button
            onClick={() => onTabChange('chat')}
            style={{
              width: 46, height: 46, borderRadius: '50%',
              background: 'var(--accent, #7B5EFF)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'navGlow 3s ease-in-out infinite',
              WebkitTapHighlightColor: 'transparent',
              outline: 'none',
              flexShrink: 0,
            }}
          >
            {/* Thread / nit icon */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 3C7 3 3 7 3 12s4 9 9 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 3c5 0 9 4 9 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"/>
              <circle cx="12" cy="12" r="2.5" fill="white"/>
            </svg>
          </button>
          <span style={{ fontSize: 10, fontFamily: 'Inter', fontWeight: 500, color: 'rgba(123,94,255,0.85)', marginTop: 2 }}>
            Нить
          </span>
        </div>

        {/* Матчи */}
        <NavTab
          active={activeTab === 'matches'}
          label="Матчи"
          badge={matchBadge}
          onClick={() => onTabChange('matches')}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 21C12 21 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          }
        />

        {/* Я */}
        <NavTab
          active={activeTab === 'profile'}
          label="Я"
          onTouchStart={startLongPress}
          onTouchEnd={handleProfileTouchEnd}
          onMouseDown={startLongPress}
          onMouseUp={() => { cancelLongPress() }}
          onClick={handleProfileClick}
          icon={
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />
      </div>

      {/* Context menu for 👤 */}
      {contextMenuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 200 }}
          onClick={() => setContextMenuOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'var(--bg2, #13111a)',
              borderRadius: '20px 20px 0 0',
              border: '1px solid var(--l, rgba(255,255,255,0.08))',
              borderBottom: 'none',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              animation: 'slideUp 0.22s cubic-bezier(0.34,1.2,0.64,1)',
            }}
          >
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--d4, rgba(255,255,255,0.12))', margin: '12px auto 8px' }} />

            <ContextItem
              icon="👁"
              label="Просмотры профиля"
              badge={badges.views}
              onClick={() => { setContextMenuOpen(false); onNavigateTo('views') }}
            />
            <ContextItem
              icon="🔖"
              label="Отложенные профили"
              onClick={() => { setContextMenuOpen(false); onNavigateTo('saved') }}
            />

            <div style={{ height: 1, background: 'var(--l, rgba(255,255,255,0.08))', margin: '6px 16px' }} />

            <ContextItem
              icon="⚙"
              label="Настройки"
              onClick={() => { setContextMenuOpen(false); onOpenSettings() }}
            />
            <ContextItem
              icon={isPaused ? '▶' : '⏸'}
              label={pauseLoading ? 'Обновление...' : (isPaused ? 'Снять с паузы' : 'Поставить на паузу')}
              onClick={handleTogglePause}
            />

            {isAdmin && (
              <>
                <div style={{ height: 1, background: 'var(--l, rgba(255,255,255,0.08))', margin: '6px 16px' }} />
                <ContextItem
                  icon="🛡"
                  label="Админ-панель"
                  onClick={() => { setContextMenuOpen(false); onNavigateTo('admin') }}
                />
              </>
            )}

            <div style={{ height: 16 }} />
          </div>

          <style>{`
            @keyframes slideUp { from { transform: translateY(100%) } to { transform: none } }
          `}</style>
        </div>
      )}

      <style>{`
        @keyframes navGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(123,94,255,0); }
          50% { box-shadow: 0 0 14px 4px rgba(123,94,255,0.4); }
        }
      `}</style>
    </>
  )
}

function ContextItem({ icon, label, badge, onClick }: {
  icon: string
  label: string
  badge?: number
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '13px 20px',
        background: 'none', border: 'none', cursor: 'pointer',
        color: 'var(--d1, rgba(255,255,255,0.8))', fontFamily: 'Inter',
        fontSize: 15, fontWeight: 500, textAlign: 'left',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <span style={{ fontSize: 18, width: 24, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          background: '#ff4466', color: '#fff',
          borderRadius: 20, minWidth: 20, height: 20,
          fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 6px',
        }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
