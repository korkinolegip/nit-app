interface RecordingBarProps {
  seconds: number
  onCancel: () => void
}

export default function RecordingBar({ seconds, onCancel }: RecordingBarProps) {
  const mm = Math.floor(seconds / 60)
  const ss = seconds % 60

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 14px', marginBottom: '10px',
      background: 'var(--d5)', border: '1px solid var(--l)', borderRadius: '12px',
    }}>
      <div style={{
        width: '7px', height: '7px', borderRadius: '50%', background: '#ff4444',
        animation: 'rp 1s infinite', flexShrink: 0,
      }} />
      <div style={{ flex: 1, fontSize: '13px', color: 'var(--d3)' }}>Запись...</div>
      <div style={{
        fontSize: '13px', fontWeight: 500, color: 'var(--d2)',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {mm}:{String(ss).padStart(2, '0')}
      </div>
      <div onClick={onCancel} style={{
        fontSize: '12px', color: 'var(--d3)', cursor: 'pointer', textDecoration: 'underline',
      }}>
        отмена
      </div>
    </div>
  )
}
