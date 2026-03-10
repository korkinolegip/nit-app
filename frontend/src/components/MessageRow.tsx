import { useState } from 'react'
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
  onNavigate?: (screen: string) => void
  onMatchAction?: (matchId: number, action: 'like' | 'skip') => Promise<{ mutual_match?: boolean; match_chat_id?: number } | void>
}

export default function MessageRow({ message, onConfirmPortrait, onEditPortrait, onUploadPhoto, onViewCard, onNavigate, onMatchAction, onOpenMatch }: MessageRowProps) {
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
        ) : message.type === 'activity_summary' && message.cardData ? (
          <div style={{
            background: 'var(--bg3)', border: '1px solid var(--l)',
            borderRadius: '16px', borderBottomLeftRadius: '4px', overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 16px 12px', fontSize: '15px', lineHeight: 1.65, fontWeight: 300, color: 'var(--d1)' }}>
              {message.text}
            </div>
            {/* Counts row */}
            <div style={{ display: 'flex', borderTop: '1px solid var(--l)', borderBottom: '1px solid var(--l)' }}>
              {[
                { label: 'Матчи', value: message.cardData.new_matches, screen: 'matches' },
                { label: 'Сообщения', value: message.cardData.new_messages, screen: 'chats' },
                { label: 'Просмотры', value: message.cardData.new_views, screen: 'views' },
              ].map((item, i) => (
                <div
                  key={i}
                  onClick={() => item.value > 0 && onNavigate?.(item.screen)}
                  style={{
                    flex: 1, padding: '12px 8px', textAlign: 'center',
                    borderRight: i < 2 ? '1px solid var(--l)' : 'none',
                    cursor: item.value > 0 ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ fontSize: 20, fontWeight: 700, color: item.value > 0 ? 'var(--w)' : 'var(--d4)' }}>
                    {item.value}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--d4)', marginTop: 2 }}>{item.label}</div>
                </div>
              ))}
            </div>
            {/* Nav buttons */}
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px' }}>
              {message.cardData.new_matches > 0 && (
                <button onClick={() => onNavigate?.('matches')} style={{
                  flex: 1, padding: '9px 8px', background: 'var(--w)', border: 'none',
                  borderRadius: 10, color: 'var(--bg)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'Inter',
                }}>Матчи</button>
              )}
              {message.cardData.new_messages > 0 && (
                <button onClick={() => onNavigate?.('chats')} style={{
                  flex: 1, padding: '9px 8px', background: 'var(--w)', border: 'none',
                  borderRadius: 10, color: 'var(--bg)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'Inter',
                }}>Чаты</button>
              )}
              {message.cardData.new_views > 0 && (
                <button onClick={() => onNavigate?.('views')} style={{
                  flex: 1, padding: '9px 8px', background: 'none', border: '1px solid var(--l)',
                  borderRadius: 10, color: 'var(--d2)', fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'Inter',
                }}>Просмотры</button>
              )}
            </div>
          </div>
        ) : message.type === 'action_buttons' && message.actionButtons ? (
          <div>
            <div style={{
              fontSize: '15px', lineHeight: 1.65, fontWeight: 300, color: 'var(--d1)',
              padding: '12px 16px', borderRadius: '16px', background: 'var(--bg3)',
              border: '1px solid var(--l)', borderBottomLeftRadius: '4px', marginBottom: '10px',
            }}>
              {message.text}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {message.actionButtons.map((btn, i) => (
                <button
                  key={i}
                  onClick={() => onNavigate?.(btn.screen)}
                  style={{
                    padding: '9px 16px', background: 'var(--bg3)', border: '1px solid var(--l)',
                    borderRadius: 10, color: 'var(--d1)', fontSize: 13, fontWeight: 500,
                    cursor: 'pointer', fontFamily: 'Inter',
                  }}
                >
                  {btn.label}
                </button>
              ))}
            </div>
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
                <UserCardItem
                  key={card.match_id}
                  card={card}
                  onViewCard={onViewCard}
                  onMatchAction={onMatchAction}
                  onOpenMatch={onOpenMatch}
                />
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

function UserCardItem({ card, onViewCard, onMatchAction, onOpenMatch }: {
  card: CardItem
  onViewCard?: (card: CardItem) => void
  onMatchAction?: (matchId: number, action: 'like' | 'skip') => Promise<{ mutual_match?: boolean; match_chat_id?: number } | void>
  onOpenMatch?: (matchId: number) => void
}) {
  const [acted, setActed] = useState<'like' | 'skip' | null>(null)
  const [loading, setLoading] = useState(false)
  const [mutualChatId, setMutualChatId] = useState<number | null>(null)

  const handleAction = async (action: 'like' | 'skip') => {
    if (!onMatchAction || loading) return
    setLoading(true)
    try {
      const res = await onMatchAction(card.match_id, action)
      setActed(action)
      if (res && res.mutual_match && res.match_chat_id) {
        setMutualChatId(res.match_chat_id)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background: 'var(--bg3)', border: '1px solid var(--l)',
      borderRadius: '16px', overflow: 'hidden',
    }}>
      <div
        style={{ display: 'flex', gap: 12, padding: '12px', cursor: 'pointer' }}
        onClick={() => !acted && onViewCard?.(card)}
      >
        {/* Photo */}
        <div style={{
          width: 64, height: 64, borderRadius: 12, flexShrink: 0,
          background: 'var(--bg)', overflow: 'hidden',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24,
        }}>
          {card.photo_url
            ? <img src={card.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : '👤'
          }
        </div>
        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: acted ? 'var(--d3)' : 'var(--w)', marginBottom: 2 }}>
            {card.name}{card.age ? `, ${card.age}` : ''}
          </div>
          <div style={{ fontSize: 12, color: 'var(--d3)', marginBottom: 6 }}>
            {[card.city, card.goal].filter(Boolean).join(' · ')}
          </div>
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

      {/* Actions */}
      <div style={{ borderTop: '1px solid var(--l)', padding: '10px 12px', display: 'flex', gap: 8 }}>
        {mutualChatId ? (
          <button
            onClick={() => onOpenMatch?.(mutualChatId)}
            style={{
              flex: 1, padding: '9px', background: '#22c55e', border: 'none',
              borderRadius: 10, color: '#fff', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'Inter',
            }}
          >
            Взаимно! Открыть чат →
          </button>
        ) : acted === 'like' ? (
          <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--d3)', padding: '9px' }}>
            Запрос отправлен ✓
          </div>
        ) : acted === 'skip' ? (
          <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'var(--d4)', padding: '9px' }}>
            Пропущен
          </div>
        ) : (
          <>
            <button
              onClick={() => handleAction('skip')}
              disabled={loading}
              style={{
                flex: 1, padding: '9px', background: 'none', border: '1px solid var(--l)',
                borderRadius: 10, color: 'var(--d3)', fontSize: 12, fontWeight: 500,
                cursor: 'pointer', fontFamily: 'Inter',
              }}
            >
              Пропустить
            </button>
            <button
              onClick={() => handleAction('like')}
              disabled={loading}
              style={{
                flex: 2, padding: '9px', background: 'var(--w)', border: 'none',
                borderRadius: 10, color: 'var(--bg)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'Inter',
              }}
            >
              Написать
            </button>
          </>
        )}
      </div>
    </div>
  )
}
