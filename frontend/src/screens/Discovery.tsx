interface DiscoveryProps {
  onBack: () => void
}

export default function Discovery({ onBack }: DiscoveryProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--bg)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px 10px', borderBottom: '1px solid var(--l)',
        background: 'var(--bg)', flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            width: '32px', height: '32px', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            color: 'var(--d2)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <div style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '.04em', color: 'var(--w)' }}>
          ДЛЯ ТЕБЯ
        </div>
        <div style={{ width: 32 }} />
      </div>

      {/* Content */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}>
        {/* Empty state icon */}
        <div style={{
          width: 72, height: 72, borderRadius: '20px',
          background: 'var(--bg3)', border: '1px solid var(--l)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '20px',
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
            <circle cx="9" cy="7" r="3" stroke="var(--d3)" strokeWidth="1.5"/>
            <path d="M3 20c0-3.314 2.686-6 6-6s6 2.686 6 6" stroke="var(--d3)" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="17" cy="8" r="2.5" stroke="var(--d3)" strokeWidth="1.5"/>
            <path d="M21 20c0-2.761-1.791-5-4-5" stroke="var(--d3)" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </div>

        <div style={{
          fontSize: '17px', fontWeight: 500, color: 'var(--d1)',
          marginBottom: '10px', letterSpacing: '-0.02em',
        }}>
          Скоро здесь появятся люди
        </div>
        <div style={{
          fontSize: '14px', color: 'var(--d3)', textAlign: 'center',
          lineHeight: 1.6, maxWidth: '240px',
        }}>
          Добавь фото — и алгоритм подберёт подходящих людей с совместимостью в процентах
        </div>

        <button
          onClick={onBack}
          style={{
            marginTop: '32px',
            padding: '13px 28px',
            background: 'var(--w)',
            color: 'var(--bg)',
            border: 'none',
            borderRadius: '12px',
            fontFamily: 'Inter',
            fontSize: '14px',
            fontWeight: 600,
            cursor: 'pointer',
            letterSpacing: '-0.01em',
          }}
        >
          Вернуться в чат
        </button>
      </div>
    </div>
  )
}
