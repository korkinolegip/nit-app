import { type Message } from '../hooks/useChat'
import PortraitCard from './PortraitCard'
import VoiceMessage from './VoiceMessage'

interface MessageRowProps {
  message: Message
  onConfirmPortrait?: () => void
  onEditPortrait?: () => void
  onUploadPhoto?: () => void
}

export default function MessageRow({ message, onConfirmPortrait, onEditPortrait, onUploadPhoto }: MessageRowProps) {
  const isAI = message.sender === 'ai'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isAI ? 'flex-start' : 'flex-end',
        animation: 'mp 0.28s ease both',
      }}
    >
      <div style={{ maxWidth: '86%', display: 'flex', flexDirection: 'column', alignItems: isAI ? 'flex-start' : 'flex-end' }}>
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
              fontSize: '15px',
              lineHeight: 1.65,
              fontWeight: 300,
              color: 'var(--d1)',
              padding: '12px 16px',
              borderRadius: '16px',
              background: 'var(--bg3)',
              border: '1px solid var(--l)',
              borderBottomLeftRadius: '4px',
              marginBottom: '10px',
            }}>
              {message.text}
            </div>
            <PortraitCard
              data={message.cardData}
              onConfirm={onConfirmPortrait}
              onEdit={onEditPortrait}
            />
          </div>
        ) : message.type === 'photo_prompt' ? (
          <div>
            <div style={{
              fontSize: '15px',
              lineHeight: 1.65,
              fontWeight: 300,
              color: 'var(--d1)',
              padding: '12px 16px',
              borderRadius: '16px',
              background: 'var(--bg3)',
              border: '1px solid var(--l)',
              borderBottomLeftRadius: '4px',
              marginBottom: '10px',
            }}>
              {message.text}
            </div>
            <button
              onClick={onUploadPhoto}
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--w)',
                color: 'var(--bg)',
                border: 'none',
                borderRadius: '12px',
                fontFamily: 'Inter',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span>📷</span> Добавить фото
            </button>
          </div>
        ) : (
          <div style={{
            fontSize: '15px',
            lineHeight: 1.65,
            fontWeight: 300,
            letterSpacing: '-0.01em',
            color: 'var(--d1)',
            padding: '12px 16px',
            borderRadius: '16px',
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
