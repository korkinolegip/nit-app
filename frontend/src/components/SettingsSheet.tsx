import { apiRequest } from '../api/client'

interface SettingsSheetProps {
  onClose: () => void
}

export default function SettingsSheet({ onClose }: SettingsSheetProps) {
  const handleClearChat = async () => {
    if (!confirm('Очистить историю чата с Нитью?')) return
    try {
      await apiRequest('/api/chat/history', { method: 'DELETE' })
    } catch {
      // ignore
    }
    onClose()
    window.location.reload()
  }

  const items = [
    {
      label: 'Очистить историю чата',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      color: 'var(--d2)',
      onClick: handleClearChat,
    },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)',
        animation: 'fadeIn 0.2s ease',
      }} />
      <div style={{
        position: 'relative', background: 'var(--bg2)',
        borderRadius: '20px 20px 0 0', padding: '0 20px 40px',
        animation: 'slideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
        border: '1px solid var(--l)', borderBottom: 'none',
      }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--d4)', margin: '12px auto 20px' }} />
        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.08em', color: 'var(--d3)', textTransform: 'uppercase', marginBottom: '14px' }}>
          Настройки
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {items.map((item, i) => (
            <button
              key={i}
              onClick={item.onClick}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 16px', background: 'var(--bg3)',
                border: '1px solid var(--l)', borderRadius: '14px',
                cursor: 'pointer', color: item.color,
                fontFamily: 'Inter', fontSize: '14px', fontWeight: 500,
                textAlign: 'left',
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
