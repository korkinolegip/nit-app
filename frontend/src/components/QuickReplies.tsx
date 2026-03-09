interface QuickRepliesProps {
  replies: string[]
  onSelect: (text: string) => void
}

export default function QuickReplies({ replies, onSelect }: QuickRepliesProps) {
  if (replies.length === 0) return null

  return (
    <div style={{
      display: 'flex', gap: '7px', overflowX: 'auto', padding: '4px 14px 12px',
      flexShrink: 0, background: 'var(--bg)',
    }}>
      {replies.map((text, i) => (
        <button key={i} onClick={() => onSelect(text)} style={{
          flexShrink: 0, padding: '8px 14px', background: 'none',
          border: '1px solid var(--l)', borderRadius: '100px', fontSize: '13px',
          color: 'var(--d3)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'Inter',
        }}>
          {text}
        </button>
      ))}
    </div>
  )
}
