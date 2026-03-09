interface VoiceMessageProps {
  duration: string
}

export default function VoiceMessage({ duration }: VoiceMessageProps) {
  const bars = Array.from({ length: 18 }, () => Math.floor(Math.random() * 14 + 5))

  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '10px',
      background: 'var(--bg4)',
      border: '1px solid var(--l2)',
      borderRadius: '12px',
      padding: '10px 14px',
      minWidth: '190px',
    }}>
      <div style={{
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        background: 'var(--d4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        cursor: 'pointer',
      }}>
        <svg viewBox="0 0 24 24" fill="none" width="10" height="10">
          <path d="M8 5v14l11-7z" fill="rgba(255,255,255,.7)" />
        </svg>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2px', height: '16px' }}>
        {bars.map((h, i) => (
          <div key={i} style={{
            width: '2px',
            height: `${h}px`,
            borderRadius: '2px',
            background: 'var(--d3)',
          }} />
        ))}
      </div>
      <div style={{ fontSize: '11px', color: 'var(--d3)' }}>{duration}</div>
    </div>
  )
}
