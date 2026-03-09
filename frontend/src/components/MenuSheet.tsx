interface MenuSheetProps {
  onNavigate: (screen: 'discovery' | 'matches' | 'profile') => void
  onClose: () => void
}

const menuItems = [
  {
    id: 'discovery' as const,
    label: 'Люди',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M21 20c0-2.761-1.791-5-4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'matches' as const,
    label: 'Матчи',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <path d="M12 21C12 21 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'profile' as const,
    label: 'Профиль',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
    ),
  },
]

export default function MenuSheet({ onNavigate, onClose }: MenuSheetProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(2px)',
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'relative',
        background: 'var(--bg2)',
        borderRadius: '20px 20px 0 0',
        padding: '0 20px 40px',
        animation: 'slideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        border: '1px solid var(--l)',
        borderBottom: 'none',
      }}>
        {/* Handle */}
        <div style={{
          width: 36, height: 4, borderRadius: 2, background: 'var(--d4)',
          margin: '12px auto 24px',
        }} />

        {/* Items */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px',
        }}>
          {menuItems.map(item => (
            <button
              key={item.id}
              onClick={() => { onNavigate(item.id); onClose() }}
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--l)',
                borderRadius: '16px',
                padding: '20px 12px 16px',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: '10px',
                cursor: 'pointer',
                color: 'var(--d2)',
                fontFamily: 'Inter',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '-0.01em',
                transition: 'background 0.15s',
              }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </div>
  )
}
