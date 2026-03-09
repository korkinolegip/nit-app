import { useState, useEffect, useRef, useCallback } from 'react'
import InputBar from '../components/InputBar'
import { getMatchMessages, sendMatchMessage } from '../api/matches'

interface MatchChatProps {
  matchId: number
  onBack: () => void
}

interface ChatMessage {
  id: number
  sender_id: number
  content_type: string
  text: string | null
  created_at: string
}

export default function MatchChat({ matchId, onBack }: MatchChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [partnerName, setPartnerName] = useState('')
  const [chatStatus, setChatStatus] = useState('')
  const [deadline, setDeadline] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async () => {
    try {
      const data = await getMatchMessages(matchId)
      setMessages(data.messages)
      setPartnerName(data.partner?.name || '')
      setChatStatus(data.chat_status)
      setDeadline(data.deadline || '')
    } catch {
      console.error('Failed to load messages')
    }
  }, [matchId])

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 5000) // Poll every 5s
    return () => clearInterval(interval)
  }, [loadMessages])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages])

  const handleSend = async (text: string) => {
    try {
      await sendMatchMessage(matchId, text)
      await loadMessages()
    } catch {
      console.error('Failed to send message')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid var(--l)',
        background: 'var(--bg)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div onClick={onBack} style={{
            width: '32px', height: '32px', borderRadius: '8px',
            border: '1px solid var(--l)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            marginRight: '6px',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M19 12H5M12 5l-7 7 7 7" stroke="rgba(255,255,255,.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--w)' }}>
            {partnerName || 'Чат'}
          </div>
          <div style={{
            fontSize: '11px', color: 'var(--d3)', background: 'var(--d5)',
            border: '1px solid var(--l)', borderRadius: '6px', padding: '3px 8px',
          }}>
            {chatStatus === 'open' ? 'совпадение' : chatStatus}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '20px 14px 8px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        background: 'var(--bg)',
      }}>
        {messages.map(msg => (
          <div key={msg.id} style={{
            display: 'flex',
            justifyContent: msg.sender_id === 0 ? 'flex-start' : 'flex-end',
            animation: 'mp 0.28s ease both',
          }}>
            <div style={{
              maxWidth: '86%', display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                fontSize: '15px', lineHeight: 1.65, fontWeight: 300, color: 'var(--d1)',
                padding: '12px 16px', borderRadius: '16px',
                background: msg.sender_id === 0 ? 'var(--bg3)' : 'var(--bg4)',
                border: `1px solid ${msg.sender_id === 0 ? 'var(--l)' : 'var(--l2)'}`,
                borderBottomLeftRadius: msg.sender_id === 0 ? '4px' : '16px',
                borderBottomRightRadius: msg.sender_id === 0 ? '16px' : '4px',
              }}>
                {msg.text || '[голосовое сообщение]'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--d3)', marginTop: '4px' }}>
                {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      {chatStatus === 'open' ? (
        <InputBar
          onSendText={handleSend}
          onSendVoice={async () => {}}
        />
      ) : (
        <div style={{
          padding: '16px', textAlign: 'center', color: 'var(--d3)',
          fontSize: '13px', borderTop: '1px solid var(--l)',
        }}>
          {chatStatus === 'closed' ? 'Время чата истекло' :
           chatStatus === 'frozen' ? 'Чат заморожен' :
           chatStatus === 'exchanged' ? 'Контакты обменяны' :
           'Чат недоступен'}
        </div>
      )}

      <style>{`
        @keyframes mp {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes rp { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
      `}</style>
    </div>
  )
}
