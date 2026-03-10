import { type Message } from '../hooks/useChat'
import PortraitCard from './PortraitCard'
import VoiceMessage from './VoiceMessage'

interface CardItem {
  match_id: number
  name: string
  age: number
  city: string
  goal: string | null
  personality_type: string | null
  profile_text: string | null
  compatibility_score: number
  compatibility_label: string
  photo_url: string | null
}

interface MessageRowProps {
  message: Message
  onConfirmPortrait?: () => void
  onEditPortrait?: () => void
  onUploadPhoto?: () => void
  onViewCard?: (card: CardItem) => void
  onOpenMatch?: (matchId: number) => void
}

export default function MessageRow({ message, onConfirmPortrait, onEditPortrait, onUploadPhoto, onViewCard }: MessageRowProps) {
  const isAI = message.sender === 'ai'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isAI ? 'flex-start' : 'flex-end',
        animation: 'mp 0.28s ease both',
      }}
    >
      <div style={{ maxWidth: '92%', display: 'flex', flexDirection: 'column', alignItems: isAI ? 'flex-start' : 'flex-end' }}>
        <div style={{
          fontSize: '10px',
          fontWeight: 600,
          letterSpacing: '0.09em',
          textTransform: 'uppercase' as const,
          color: 'var(--d3)',
          marginBottom: '5px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--d3)' }} />
          {isAI ? 'Нить' : 'Ты'}
        </div>

        {message.type === 'voice' ? (
          <VoiceMessage duration={message.voiceDuration || '0:00'} />
        ) : message.type === 'portrait_card' && message.cardData ? (
          <div>
            <div style={{
              fontSize: '15px', lineHeight: 1.65, fontWeight: 300, color: 'var(--d1)',
              padding: '12px 16px', borderRadius: '16px', background: 'var(--bg3)',
              border: '1px solid var(--l)', borderBottomLeftRadius: '4px', marginBottom: '10px',
            }}>
              {message.text}
            </div>
            <PortraitCard data={message.cardData} onConfirm={onConfirmPortrait} onEdit={onEditPortrait} />
          </div>
        ) : message.type === 'photo_prompt' ? (
          <div>
            <div style={{
              fontSize: '15px', lineHeight: 1.65, fontWeight: 300, color: 'var(--d1)',
              padding: '12px 16px', borderRadius: '16px', background: 'var(--bg3)',
              border: '1px solid var(--l)', borderBottomLeftRadius: '4px', marginBottom: '10px',
            }}>
              {message.text}
            </div>
            <button
              onClick={onUploadPhoto}
              style={{
                width: '100%', padding: '12px', background: 'var(--w)', color: 'var(--bg)',
                border: 'none', borderRadius: '12px', fontFamily: 'Inter',
                fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              }}
            >
              <span>📷</span> Добавить фото
            </button>
          </div>
        ) : message.type === 'user_cards' && message.cardData?.cards ? (
          <div style={{ width: '100%' }}>
            {message.text && (
              <div style={{
                fontSize: '15px', lineHeight: 1.65, fontWeight: 300, color: 'var(--d1)',
                padding: '12px 16px', borderRadius: '16px', background: 'var(--bg3)',
                border: '1px solid var(--l)', borderBottomLeftRadius: '4px', marginBottom: '10px',
              }}>
                {message.text}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
              {(message.cardData.cards as CardItem[]).map((card) => (
                <div
                  key={card.match_id}
                  style={{
                    background: 'var(--bg3)', border: '1px solid var(--l)',
                    borderRadius: '16px', overflow: 'hidden', cursor: 'pointer',
                  }}
                  onClick={() => onViewCard?.(card)}
                >
                  <div style={{ display: 'flex', gap: 12, padding: '12px' }}>
                    {/* Photo */}
                    <div style={{
                      width: 64, height: 64, borderRadius: 12, flexShrink: 0,
                      background: 'var(--bg)', overflow: 'hidden',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 24,
                    }}>
                      {card.photo_url
                        ? <img src={card.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : '👤'
                      }
                    </div>
                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--w)', marginBottom: 2 }}>
                        {card.name}{card.age ? `, ${card.age}` : ''}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--d3)', marginBottom: 6 }}>
                        {[card.city, card.goal].filter(Boolean).join(' · ')}
                      </div>
                      {/* Compatibility */}
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--l)',
                        borderRadius: 6, padding: '3px 8px',
                      }}>
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: card.compatibility_score >= 70 ? '#4ade80' : card.compatibility_score >= 50 ? '#facc15' : 'var(--d3)',
                        }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--d2)' }}>
                          {card.compatibility_score}% {card.compatibility_label}
                        </span>
                      </div>
                    </div>
                  </div>
                  {/* Open button */}
                  <div style={{
                    borderTop: '1px solid var(--l)', padding: '10px 12px',
                    fontSize: 12, fontWeight: 600, color: 'var(--d2)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.8"/>
                      <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                    Открыть профиль
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            fontSize: '15px', lineHeight: 1.65, fontWeight: 300,
            letterSpacing: '-0.01em', color: 'var(--d1)',
            padding: '12px 16px', borderRadius: '16px',
            background: isAI ? 'var(--bg3)' : 'var(--bg4)',
            border: `1px solid ${isAI ? 'var(--l)' : 'var(--l2)'}`,
            borderBottomLeftRadius: isAI ? '4px' : '16px',
            borderBottomRightRadius: isAI ? '16px' : '4px',
          }}
            dangerouslySetInnerHTML={{ __html: message.text }}
          />
        )}
      </div>
    </div>
  )
}
