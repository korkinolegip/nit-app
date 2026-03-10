import { useEffect, useRef, useCallback, useState } from 'react'
import { useChat } from '../hooks/useChat'
import MessageRow from '../components/MessageRow'
import QuickReplies from '../components/QuickReplies'
import InputBar from '../components/InputBar'
import MenuSheet from '../components/MenuSheet'
import { transcribeVoice, getChatHistory } from '../api/chat'
import { uploadPhoto } from '../api/profile'

interface ChatProps {
  onOpenMatch: (matchId: number) => void
  onNavigateTo: (screen: 'discovery' | 'matches' | 'profile') => void
  isReturning?: boolean
  sessionComplete?: boolean
  hasPhotos?: boolean
}

export default function Chat({ onOpenMatch, onNavigateTo, isReturning = false, sessionComplete = false, hasPhotos = false }: ChatProps) {
  const { messages, isTyping, quickReplies, send, addMessage, scrollRef, setQuickReplies } = useChat()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)

  // Initial greeting / history restore
  useEffect(() => {
    if (isReturning) {
      // Load full chat history from server
      getChatHistory()
        .then(({ messages: history }) => {
          if (history.length > 0) {
            history.forEach(msg => addMessage({ sender: msg.sender, text: msg.text, type: 'text' }))
            // Show context-aware continuation message
            if (!hasPhotos && sessionComplete) {
              setTimeout(() => {
                addMessage({ sender: 'ai', text: 'Загрузи фото чтобы начать находить людей:', type: 'photo_prompt' })
              }, 300)
            }
          } else {
            // Fallback greeting if no history
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

    // New user greeting
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

  // Scroll to bottom when keyboard opens (mobile)
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

  const handleSendVoice = async (blob: Blob) => {
    const duration = '0:00'
    addMessage({ sender: 'me', text: '', type: 'voice', voiceDuration: duration })

    try {
      const result = await transcribeVoice(blob)
      await send(result.text)
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      addMessage({
        sender: 'ai',
        text: `Голос: ${detail}`,
        type: 'text',
      })
    }
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
        <button
          onClick={() => setIsMenuOpen(true)}
          style={{
            width: '32px', height: '32px', borderRadius: '8px',
            border: '1px solid var(--l)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            background: 'none',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="5" r="1.5" fill="rgba(255,255,255,.4)" />
            <circle cx="12" cy="12" r="1.5" fill="rgba(255,255,255,.4)" />
            <circle cx="12" cy="19" r="1.5" fill="rgba(255,255,255,.4)" />
          </svg>
        </button>
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

      {/* Quick replies */}
      <QuickReplies replies={quickReplies} onSelect={(text) => send(text)} />

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handlePhotoUpload}
      />

      {/* Input */}
      <InputBar onSendText={send} onSendVoice={handleSendVoice} />

      {/* Menu sheet */}
      {isMenuOpen && (
        <MenuSheet
          onNavigate={onNavigateTo}
          onClose={() => setIsMenuOpen(false)}
        />
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
      `}</style>
    </div>
  )
}
