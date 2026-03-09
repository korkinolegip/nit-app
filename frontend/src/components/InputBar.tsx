import { useState, useRef, useCallback } from 'react'
import RecordingBar from './RecordingBar'
import { useVoiceRecord } from '../hooks/useVoiceRecord'

interface InputBarProps {
  onSendText: (text: string) => void
  onSendVoice: (blob: Blob) => void
}

export default function InputBar({ onSendText, onSendVoice }: InputBarProps) {
  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { isRecording, seconds, start, stop, cancel } = useVoiceRecord()

  const handleSend = useCallback(() => {
    const trimmed = text.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setText('')
    if (textareaRef.current) textareaRef.current.style.height = '24px'
  }, [text, onSendText])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  const handleInput = useCallback(() => {
    const el = textareaRef.current
    if (el) {
      el.style.height = '24px'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [])

  const handleToggleRecord = useCallback(async () => {
    if (isRecording) {
      const blob = await stop()
      if (blob) onSendVoice(blob)
    } else {
      start()
    }
  }, [isRecording, start, stop, onSendVoice])

  const hasText = text.trim().length > 0

  return (
    <div style={{ padding: '6px 14px 28px', flexShrink: 0, borderTop: '1px solid var(--l)', background: 'var(--bg)' }}>
      {isRecording && <RecordingBar seconds={seconds} onCancel={cancel} />}

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: '8px',
        background: 'var(--bg3)', border: '1px solid var(--l)', borderRadius: '16px',
        padding: '10px 10px 10px 16px',
      }}>
        <textarea
          ref={textareaRef}
          placeholder="Напиши что-нибудь..."
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1, background: 'none', border: 'none', outline: 'none',
            fontFamily: 'Inter', fontSize: '15px', fontWeight: 300, color: 'var(--w)',
            resize: 'none', lineHeight: 1.5, minHeight: '24px', maxHeight: '120px', height: '24px',
          }}
        />

        {hasText ? (
          <button onClick={handleSend} style={{
            width: '36px', height: '36px', borderRadius: '10px', border: 'none',
            background: 'var(--w)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer',
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z" stroke="#070708" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <button onClick={handleToggleRecord} style={{
            width: '36px', height: '36px', borderRadius: '10px', border: 'none',
            background: isRecording ? '#ff4444' : 'var(--d5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer',
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="rgba(255,255,255,.5)" strokeWidth="2" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" stroke="rgba(255,255,255,.5)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
