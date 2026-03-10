import { useEffect, useRef, useCallback, useState } from 'react'
import { useChat } from '../hooks/useChat'
import MessageRow from '../components/MessageRow'
import QuickReplies from '../components/QuickReplies'
import InputBar from '../components/InputBar'
import SettingsSheet from '../components/SettingsSheet'
import { transcribeVoice, getChatHistory } from '../api/chat'
import { uploadPhoto } from '../api/profile'

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

interface ChatProps {
  onOpenMatch: (matchId: number) => void
  onNavigateTo: (screen: 'discovery' | 'matches' | 'profile') => void
  isReturning?: boolean
  sessionComplete?: boolean
  hasPhotos?: boolean
}

export default function Chat({ onOpenMatch, onNavigateTo, isReturning = false, sessionComplete = false, hasPhotos = false }: ChatProps) {
  const { messages, isTyping, quickReplies, send, addMessage, scrollRef, setQuickReplies } = useChat({ onNavigate: onNavigateTo })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [viewingCard, setViewingCard] = useState<CardItem | null>(null)

  // Initial greeting / history restore
  useEffect(() => {
    if (isReturning) {
      getChatHistory()
        .then(({ messages: history }) => {
          if (history.length > 0) {
            history.forEach(msg => addMessage({ sender: msg.sender, text: msg.text, type: 'text' }))
            if (!hasPhotos && sessionComplete) {
              setTimeout(() => {
                addMessage({ sender: 'ai', text: 'Загрузи фото чтобы начать находить людей:', type: 'photo_prompt' })
              }, 300)
            }
          } else {
            if (sessionComplete) {
              addMessage({
                sender: 'ai',
                text: hasPhotos
                  ? 'С возвращением! Профиль готов, алгоритм ищет совместимых людей.'
                  : 'С возвращением! Профиль создан. Добавь фото — с ними алгоритм работает лучше.',
                type: 'text',
              })
              if (!hasPhotos) {
                setTimeout(() => addMessage({ sender: 'ai', text: 'Загрузи фото чтобы начать находить людей:', type: 'photo_prompt' }), 600)
              }
            } else {
              addMessage({ sender: 'ai', text: 'Продолжим? Расскажи о себе — что ещё хочешь добавить.', type: 'text' })
            }
          }
        })
        .catch(() => {
          addMessage({ sender: 'ai', text: 'С возвращением! Продолжаем.', type: 'text' })
        })
      return
    }

    const t1 = setTimeout(() => {
      addMessage({
        sender: 'ai',
        text: 'Привет. Я Нить — AI-агент, который помогает найти своего человека.',
        type: 'text',
      })
    }, 300)

    const t2 = setTimeout(() => {
      addMessage({
        sender: 'ai',
        text: 'Расскажи о себе — кто ты, чем живёшь, чего ищешь.<br><b>Голосом или текстом</b> — как удобнее. Не ограничивай себя.',
        type: 'text',
      })
    }, 2000)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const handler = () => {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
      }, 50)
    }
    vv.addEventListener('resize', handler)
    return () => vv.removeEventListener('resize', handler)
  }, [scrollRef])

  const handleSendVoice = async (blob: Blob, durationSecs: number) => {
    const m = Math.floor(durationSecs / 60)
    const s = durationSecs % 60
    const duration = `${m}:${String(s).padStart(2, '0')}`
    addMessage({ sender: 'me', text: '', type: 'voice', voiceDuration: duration })

    // Retry once on failure (handles Render cold start)
    let result
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        result = await transcribeVoice(blob)
        break
      } catch (err) {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 3000))
          continue
        }
        addMessage({
          sender: 'ai',
          text: 'Не удалось распознать голос. Попробуй ещё раз.',
          type: 'text',
        })
        return
      }
    }
    if (result?.text) await send(result.text)
  }

  const handlePhotoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    addMessage({ sender: 'me', text: `📷 ${file.name}`, type: 'text' })

    try {
      await uploadPhoto(file)
      addMessage({
        sender: 'ai',
        text: 'Фото добавлено! Можешь загрузить ещё или продолжить.',
        type: 'text',
      })
    } catch {
      addMessage({
        sender: 'ai',
        text: 'Не удалось загрузить фото. Попробуй ещё раз.',
        type: 'text',
      })
    }
  }, [addMessage])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', position: 'relative' }}>
      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px',
        paddingTop: 'max(12px, env(safe-area-inset-top, 0px))',
        borderBottom: '1px solid var(--l)',
        background: 'var(--bg)', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.05em', color: 'var(--w)' }}>
            НИТЬ
          </div>
          <div style={{
            fontSize: '11px', color: 'var(--d3)', background: 'var(--d5)',
            border: '1px solid var(--l)', borderRadius: '6px', padding: '3px 8px',
          }}>
            AI-агент
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          {([
            { id: 'discovery' as const, label: 'Люди', path: (
              <><circle cx="9" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <circle cx="17" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M21 20c0-2.761-1.791-5-4-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
            )},
            { id: 'matches' as const, label: 'Матчи', path: (
              <path d="M12 21C12 21 3 15 3 9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 6-9 12-9 12z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
            )},
            { id: 'profile' as const, label: 'Профиль', path: (
              <><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M4 20c0-4.418 3.582-8 8-8s8 3.582 8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></>
            )},
          ] as const).map(item => (
            <button
              key={item.id}
              onClick={() => onNavigateTo(item.id)}
              title={item.label}
              style={{
                width: '38px', height: '38px', borderRadius: '10px',
                border: '1px solid var(--l)', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                background: 'none', color: 'rgba(255,255,255,.5)',
                gap: '3px', transition: 'all 0.15s',
              }}
              className="nav-icon-btn"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">{item.path}</svg>
              <span style={{ fontSize: '8px', fontWeight: 600, letterSpacing: '.04em', color: 'inherit', lineHeight: 1 }}>{item.label}</span>
            </button>
          ))}
          <button
            onClick={() => setIsMenuOpen(true)}
            style={{
              width: '28px', height: '28px', borderRadius: '7px',
              border: '1px solid var(--l)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              background: 'none', marginLeft: '2px',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="5" r="1.5" fill="rgba(255,255,255,.35)" />
              <circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,.35)" />
              <circle cx="12" cy="19" r="1.5" fill="rgba(255,255,255,.35)" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '20px 14px 8px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        scrollBehavior: 'smooth', background: 'var(--bg)',
      }}>
        {messages.map(msg => (
          <MessageRow
            key={msg.id}
            message={msg}
            onConfirmPortrait={() => {
              send('Всё верно')
              setQuickReplies([])
            }}
            onEditPortrait={() => {
              send('Хочу дополнить')
              setQuickReplies([])
            }}
            onUploadPhoto={() => fileInputRef.current?.click()}
            onViewCard={(card) => setViewingCard(card)}
            onOpenMatch={onOpenMatch}
          />
        ))}

        {isTyping && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ maxWidth: '86%' }}>
              <div style={{
                fontSize: '10px', fontWeight: 600, letterSpacing: '0.09em',
                textTransform: 'uppercase' as const, color: 'var(--d3)',
                marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '6px',
              }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--d3)' }} />
                Нить
              </div>
              <div style={{
                background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: '16px',
                borderBottomLeftRadius: '4px', padding: '14px 18px',
                display: 'flex', gap: '5px', alignItems: 'center',
              }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: '5px', height: '5px', borderRadius: '50%', background: 'var(--d3)',
                    animation: `tda 1.3s ease-in-out infinite ${i * 0.15}s`,
                  }} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <QuickReplies replies={quickReplies} onSelect={(text) => send(text)} />

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoUpload}
      />

      <InputBar onSendText={send} onSendVoice={handleSendVoice} />

      {isMenuOpen && (
        <SettingsSheet onClose={() => setIsMenuOpen(false)} />
      )}

      {/* Profile modal for user card */}
      {viewingCard && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end',
          animation: 'mp 0.2s ease both',
        }} onClick={() => setViewingCard(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxHeight: '90dvh', overflowY: 'auto',
            background: 'var(--bg)', borderRadius: '20px 20px 0 0',
            padding: '0 0 32px',
          }}>
            {/* Photo */}
            <div style={{ height: 280, background: 'var(--bg3)', position: 'relative', borderRadius: '20px 20px 0 0', overflow: 'hidden' }}>
              {viewingCard.photo_url
                ? <img src={viewingCard.photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>👤</div>
              }
              <button onClick={() => setViewingCard(null)} style={{
                position: 'absolute', top: 14, right: 14,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', border: 'none',
                color: '#fff', fontSize: 16, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>✕</button>
              {/* Compatibility badge */}
              <div style={{
                position: 'absolute', bottom: 14, right: 14,
                background: 'rgba(0,0,0,0.7)', border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8, padding: '4px 10px',
                fontSize: 12, fontWeight: 700, color: '#fff',
              }}>
                {viewingCard.compatibility_score}% {viewingCard.compatibility_label}
              </div>
            </div>

            <div style={{ padding: '20px 20px 0' }}>
              {/* Name + basic info */}
              <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--w)', marginBottom: 4 }}>
                {viewingCard.name}{viewingCard.age ? `, ${viewingCard.age}` : ''}
              </div>
              <div style={{ fontSize: 14, color: 'var(--d3)', marginBottom: 16 }}>
                {[viewingCard.city, viewingCard.goal].filter(Boolean).join(' · ')}
              </div>

              {/* Personality type chip */}
              {viewingCard.personality_type && (
                <div style={{
                  display: 'inline-block',
                  background: 'var(--bg3)', border: '1px solid var(--l)',
                  borderRadius: 8, padding: '5px 12px',
                  fontSize: 12, color: 'var(--d2)', marginBottom: 16,
                }}>
                  {viewingCard.personality_type}
                </div>
              )}

              {/* Profile text */}
              {viewingCard.profile_text && (
                <div style={{ fontSize: 14, color: 'var(--d2)', lineHeight: 1.65, marginBottom: 20 }}>
                  {viewingCard.profile_text}
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setViewingCard(null); onNavigateTo('discovery') }}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12,
                    background: 'var(--w)', border: 'none',
                    color: 'var(--bg)', fontSize: 14, fontWeight: 600,
                    cursor: 'pointer', fontFamily: 'Inter',
                  }}
                >
                  Открыть в Люди
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tda {
          0%, 60%, 100% { transform: none; background: var(--d3); }
          30% { transform: translateY(-5px); background: var(--d2); }
        }
        @keyframes mp {
          from { opacity: 0; transform: translateY(7px); }
          to { opacity: 1; transform: none; }
        }
        @keyframes rp { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
        .nav-icon-btn:hover { color: rgba(255,255,255,.85) !important; border-color: rgba(255,255,255,.2) !important; background: rgba(255,255,255,.05) !important; }
        .nav-icon-btn:active { transform: scale(0.92); }
      `}</style>
    </div>
  )
}
