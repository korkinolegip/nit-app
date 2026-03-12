type MainTab = 'feed' | 'discovery' | 'matches' | 'profile'

interface BottomNavProps {
  activeTab: MainTab
  onTabChange: (tab: 'feed' | 'discovery' | 'chat' | 'matches' | 'profile') => void
  badges?: { matches?: number; views?: number }
  hidden?: boolean
}

function NavTab({
  icon, label, active, badge, onClick,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  badge?: number
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 4, paddingTop: 11, paddingBottom: 7,
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
      <span style={{ fontSize: 11, fontFamily: 'Inter', fontWeight: active ? 600 : 400, letterSpacing: '-0.01em' }}>
        {label}
      </span>
    </button>
  )
}

export default function BottomNav({
  activeTab, onTabChange, badges = {}, hidden = false,
}: BottomNavProps) {
  if (hidden) return null

  return (
    <>
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--bg2, #13111a)',
        borderTop: '1px solid var(--l, rgba(255,255,255,0.08))',
        display: 'flex', alignItems: 'stretch',
        paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)',
        zIndex: 40,
      }}>
        {/* Лента */}
        <NavTab
          active={activeTab === 'feed'}
          label="Лента"
          onClick={() => onTabChange('feed')}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
          paddingTop: 8, paddingBottom: 4,
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
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 3C7 3 3 7 3 12s4 9 9 9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
              <path d="M12 3c5 0 9 4 9 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 2"/>
              <circle cx="12" cy="12" r="2.5" fill="white"/>
            </svg>
          </button>
          <span style={{ fontSize: 11, fontFamily: 'Inter', fontWeight: 500, color: 'rgba(123,94,255,0.85)', marginTop: 3 }}>
            Нить
          </span>
        </div>

        {/* Матчи */}
        <NavTab
          active={activeTab === 'matches'}
          label="Матчи"
          badge={badges.matches}
          onClick={() => onTabChange('matches')}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <path d="M12 21C12 21 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
          }
        />

        {/* Я */}
        <NavTab
          active={activeTab === 'profile'}
          label="Я"
          badge={badges.views}
          onClick={() => onTabChange('profile')}
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />
      </div>

      <style>{`
        @keyframes navGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(123,94,255,0); }
          50% { box-shadow: 0 0 14px 4px rgba(123,94,255,0.4); }
        }
      `}</style>
    </>
  )
}
