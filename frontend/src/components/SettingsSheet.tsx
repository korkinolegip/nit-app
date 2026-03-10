import { useState } from 'react'
import { apiRequest } from '../api/client'
import { getChatHistory } from '../api/chat'
import Loader from './Loader'

interface SettingsSheetProps {
  onClose: () => void
}

interface HistoryMsg {
  sender: string
  text: string
}

export default function SettingsSheet({ onClose }: SettingsSheetProps) {
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [history, setHistory] = useState<HistoryMsg[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const handleClearChat = async () => {
    if (!confirmClear) { setConfirmClear(true); return }
    setClearing(true)
    try {
      await apiRequest('/api/chat/history', { method: 'DELETE' })
    } catch {
      // ignore
    }
    onClose()
    window.location.reload()
  }

  const handleShowHistory = async () => {
    setHistoryLoading(true)
    setShowHistory(true)
    try {
      const data = await getChatHistory()
      setHistory(data.messages || [])
    } catch {
      setHistory([])
    }
    setHistoryLoading(false)
  }

  if (showHistory) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px 10px',
          paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
          borderBottom: '1px solid var(--l)', flexShrink: 0,
        }}>
          <button onClick={() => setShowHistory(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--d2)',
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
          <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>ИСТОРИЯ ЧАТА</div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--d3)', fontSize: 22, lineHeight: 1,
          }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {historyLoading ? (
            <Loader />
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', paddingTop: 60, color: 'var(--d3)', fontSize: 14 }}>
              История пуста
            </div>
          ) : history.map((msg, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: msg.sender === 'me' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth: '80%',
                background: msg.sender === 'me' ? 'var(--w)' : 'var(--bg3)',
                color: msg.sender === 'me' ? 'var(--bg)' : 'var(--d1)',
                borderRadius: msg.sender === 'me' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                border: msg.sender === 'me' ? 'none' : '1px solid var(--l)',
                padding: '10px 14px', fontSize: 14, lineHeight: 1.55,
              }}
              dangerouslySetInnerHTML={{ __html: msg.text }}
              />
            </div>
          ))}
        </div>
      </div>
    )
  }

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
          <button
            onClick={handleShowHistory}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '14px 16px', background: 'var(--bg3)',
              border: '1px solid var(--l)', borderRadius: '14px',
              cursor: 'pointer', color: 'var(--d2)',
              fontFamily: 'Inter', fontSize: '14px', fontWeight: 500, textAlign: 'left',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            </svg>
            История чата
          </button>

          {!confirmClear ? (
            <button
              onClick={handleClearChat}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '14px 16px', background: 'var(--bg3)',
                border: '1px solid var(--l)', borderRadius: '14px',
                cursor: 'pointer', color: 'var(--d2)',
                fontFamily: 'Inter', fontSize: '14px', fontWeight: 500, textAlign: 'left',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 6V4h8v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Очистить историю чата
            </button>
          ) : (
            <div style={{ background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: '14px', padding: '14px 16px' }}>
              <div style={{ fontSize: 13, color: 'var(--d2)', marginBottom: 12, lineHeight: 1.5 }}>
                Удалить всю историю? Профиль и матчи сохранятся.
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setConfirmClear(false)} style={{
                  flex: 1, padding: '10px', background: 'none',
                  border: '1px solid var(--l)', borderRadius: 10,
                  color: 'var(--d3)', fontSize: 13, cursor: 'pointer', fontFamily: 'Inter',
                }}>Отмена</button>
                <button onClick={handleClearChat} disabled={clearing} style={{
                  flex: 1, padding: '10px', background: '#c0392b',
                  border: 'none', borderRadius: 10,
                  color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter',
                }}>{clearing ? '...' : 'Удалить'}</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </div>
  )
}
