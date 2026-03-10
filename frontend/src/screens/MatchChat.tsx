import { useState, useEffect, useRef, useCallback } from 'react'
import InputBar from '../components/InputBar'
import { getMatchMessages, sendMatchMessage, MatchPartnerProfile } from '../api/matches'

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
  const [partner, setPartner] = useState<MatchPartnerProfile | null>(null)
  const [compatScore, setCompatScore] = useState(0)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [chatStatus, setChatStatus] = useState('')
  const [deadline, setDeadline] = useState('')
  const [showProfile, setShowProfile] = useState(false)
  const [myUserId, setMyUserId] = useState<number | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const loadMessages = useCallback(async () => {
    try {
      const data = await getMatchMessages(matchId)
      setMessages(data.messages)
      setPartner(data.partner)
      setCompatScore(data.compatibility_score)
      setExplanation(data.explanation)
      setChatStatus(data.chat_status)
      setDeadline(data.deadline || '')
      if (data.my_user_id) setMyUserId(data.my_user_id)
    } catch {
      console.error('Failed to load messages')
    }
  }, [matchId])

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 15000)
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

  // Get primary photo for avatar
  const avatarPhoto = partner?.photos.find(p => p.is_primary) || partner?.photos[0]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px',
        paddingTop: 'max(10px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)',
        background: 'var(--bg)', flexShrink: 0,
      }}>
        {/* Back */}
        <div onClick={onBack} style={{
          width: 32, height: 32, borderRadius: 8,
          border: '1px solid var(--l)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="rgba(255,255,255,.45)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Avatar + name — tappable → profile */}
        <div
          onClick={() => partner && setShowProfile(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer', minWidth: 0 }}
        >
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: 'var(--bg3)', border: '1px solid var(--l)',
            overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, color: 'var(--d2)',
          }}>
            {avatarPhoto?.url
              ? <img src={avatarPhoto.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (partner?.name?.[0] ?? '?')
            }
          </div>

          {/* Name + status */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--w)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {partner?.name || 'Чат'}
              </div>
              {compatScore > 0 && (
                <div style={{
                  fontSize: 11, color: 'var(--d3)', background: 'var(--bg3)',
                  border: '1px solid var(--l)', borderRadius: 6, padding: '2px 7px', flexShrink: 0,
                }}>
                  {Math.round(compatScore)}%
                </div>
              )}
              {partner?.is_online && (
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', flexShrink: 0 }} />
              )}
            </div>
            <div style={{ fontSize: 11, color: partner?.is_online ? '#22c55e' : 'var(--d4)', marginTop: 1 }}>
              {partner?.is_online
                ? 'онлайн'
                : partner?.last_seen_text
                  ? partner.last_seen_text
                  : chatStatus === 'open' ? 'нажми чтобы открыть профиль' : chatStatus === 'closed' ? 'время истекло' : chatStatus
              }
            </div>
          </div>
        </div>

        {/* Profile arrow hint */}
        {partner && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ color: 'var(--d4)', flexShrink: 0 }}>
            <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '20px 14px 8px',
        display: 'flex', flexDirection: 'column', gap: 10,
        background: 'var(--bg)',
      }}>
        {messages.map(msg => {
          const isMe = myUserId !== null ? msg.sender_id === myUserId : false
          return (
            <div key={msg.id} style={{
              display: 'flex',
              justifyContent: isMe ? 'flex-end' : 'flex-start',
              animation: 'mp 0.28s ease both',
            }}>
              <div style={{ maxWidth: '86%', display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  fontSize: 15, lineHeight: 1.65, fontWeight: 300, color: 'var(--d1)',
                  padding: '12px 16px', borderRadius: 16,
                  background: isMe ? 'var(--bg4)' : 'var(--bg3)',
                  border: `1px solid ${isMe ? 'var(--l2)' : 'var(--l)'}`,
                  borderBottomLeftRadius: isMe ? 16 : 4,
                  borderBottomRightRadius: isMe ? 4 : 16,
                }}>
                  {msg.text || '[голосовое сообщение]'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--d3)', marginTop: 4 }}>
                  {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Input */}
      {['open', 'matched', 'exchanged'].includes(chatStatus) ? (
        <InputBar onSendText={handleSend} onSendVoice={async () => {}} />
      ) : (
        <div style={{
          padding: 16, textAlign: 'center', color: 'var(--d3)',
          fontSize: 13, borderTop: '1px solid var(--l)',
        }}>
          {chatStatus === 'closed' ? 'Время чата истекло' :
           chatStatus === 'frozen' ? 'Чат заморожен' :
           'Чат недоступен'}
        </div>
      )}

      {/* Profile modal */}
      {showProfile && partner && (
        <PartnerProfileModal
          partner={partner}
          compatScore={compatScore}
          explanation={explanation}
          onClose={() => setShowProfile(false)}
        />
      )}

      <style>{`
        @keyframes mp { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
        @keyframes rp { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
        @keyframes slideUpFull { from { transform: translateY(100%) } to { transform: none } }
      `}</style>
    </div>
  )
}

function PartnerProfileModal({ partner, compatScore, explanation, onClose }: {
  partner: MatchPartnerProfile
  compatScore: number
  explanation: string | null
  onClose: () => void
}) {
  const photos = partner.photos.filter(p => p.url)
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
      {/* Photo carousel */}
      <div
        style={{ height: '55vh', position: 'relative', background: 'var(--bg2)', flexShrink: 0 }}
        onTouchStart={e => { touchStartX.current = e.touches[0].clientX }}
        onTouchEnd={e => {
          const dx = e.changedTouches[0].clientX - touchStartX.current
          if (dx < -40 && pi < orderedPhotos.length - 1) setPi(i => i + 1)
          if (dx > 40 && pi > 0) setPi(i => i - 1)
        }}
      >
        {orderedPhotos[pi]?.url ? (
          <img src={orderedPhotos[pi].url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80, color: 'var(--d4)' }}>
            {partner.name[0]}
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
        {compatScore > 0 && (
          <div style={{
            position: 'absolute', top: 'max(16px, env(safe-area-inset-top, 16px))', right: 16,
            background: 'rgba(0,0,0,.65)', borderRadius: 20, padding: '5px 12px',
            fontSize: 14, fontWeight: 700, color: '#fff', backdropFilter: 'blur(4px)',
          }}>
            {Math.round(compatScore)}%
          </div>
        )}
        {/* Photo dots */}
        {orderedPhotos.length > 1 && (
          <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', gap: 4, justifyContent: 'center' }}>
            {orderedPhotos.map((_, i) => (
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

      {/* Profile info */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 40px' }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--w)', letterSpacing: '-0.02em' }}>
          {partner.name}{partner.age ? `, ${partner.age}` : ''}
        </div>

        {/* Chips */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {partner.city && <Chip icon="📍">{partner.city}</Chip>}
          {partner.occupation && <Chip icon="💼">{partner.occupation}</Chip>}
          {partner.goal && <Chip icon="🎯">{partner.goal}</Chip>}
          {partner.personality_type && <Chip icon="🧠">{partner.personality_type}</Chip>}
          {partner.attachment_hint && <Chip icon="🔗">{attachmentLabel(partner.attachment_hint)}</Chip>}
        </div>

        {/* AI explanation */}
        {explanation && (
          <div style={{
            marginTop: 16, padding: '14px 16px',
            background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: 14,
            fontSize: 13, color: 'var(--d2)', lineHeight: 1.65, fontStyle: 'italic',
          }}>
            "{explanation}"
          </div>
        )}

        {/* About */}
        {partner.profile_text && (
          <Section label="О себе">
            <div style={{ fontSize: 14, color: 'var(--d2)', lineHeight: 1.7 }}>{partner.profile_text}</div>
          </Section>
        )}

        {partner.strengths.length > 0 && (
          <Section label="Сильные стороны">
            <TagList items={partner.strengths} />
          </Section>
        )}

        {partner.ideal_partner_traits.length > 0 && (
          <Section label="Ищет в партнёре">
            <TagList items={partner.ideal_partner_traits} />
          </Section>
        )}
      </div>
    </div>
  )
}

function Chip({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: 'var(--bg3)', border: '1px solid var(--l)',
      borderRadius: 20, padding: '5px 10px', fontSize: 13, color: 'var(--d2)',
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
          borderRadius: 20, padding: '5px 12px', fontSize: 13, color: 'var(--d2)',
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
