interface PortraitCardProps {
  data: Record<string, any>
  onConfirm?: () => void
  onEdit?: () => void
}

function Row({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: '9px', alignItems: 'flex-start' }}>
      <div style={{ fontSize: '14px', flexShrink: 0, opacity: 0.5, paddingTop: '1px' }}>{icon}</div>
      <div style={{ fontSize: '13.5px', color: 'var(--d2)', lineHeight: 1.45 }}
        dangerouslySetInnerHTML={{ __html: text }}
      />
    </div>
  )
}

export default function PortraitCard({ data, onConfirm, onEdit }: PortraitCardProps) {
  const now = new Date()
  const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`

  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--l)',
      borderRadius: '16px',
      overflow: 'hidden',
      maxWidth: '420px',
      width: '100%',
    }}>
      <div style={{
        padding: '13px 16px',
        borderBottom: '1px solid var(--l)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
      }}>
        <div style={{ fontSize: '18px' }}>&#x1FA9E;</div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--w)' }}>Твой портрет</div>
          <div style={{ fontSize: '11px', color: 'var(--d3)', marginTop: '1px' }}>Нить &middot; {time}</div>
        </div>
      </div>

      <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {data.name && <Row icon="&#x1F464;" text={`<b>${data.name}</b>${data.age ? `, ${data.age} лет` : ''}${data.city ? ` &middot; ${data.city}` : ''}`} />}
        {data.occupation && <Row icon="&#x1F4BC;" text={data.occupation} />}
        <div style={{ height: '1px', background: 'var(--l)' }} />
        {data.interests?.length > 0 && <Row icon="&#x2728;" text={Array.isArray(data.interests) ? data.interests.join(', ') : data.interests} />}
        {data.social_energy && <Row icon="&#x1F331;" text={data.social_energy === 'introvert' ? 'Интроверт' : data.social_energy === 'extravert' ? 'Экстраверт' : 'Амбиверт'} />}
        <div style={{ height: '1px', background: 'var(--l)' }} />
        {data.goal && <Row icon="&#x1F3AF;" text={`<b>Ищет:</b> ${data.goal}`} />}
        {data.partner_image && <Row icon="&#x1F4AC;" text={`<b>Важно:</b> ${data.partner_image}`} />}
      </div>

      <div style={{ display: 'flex', gap: '8px', padding: '0 16px 16px' }}>
        <button onClick={onConfirm} style={{
          flex: 1, padding: '11px', background: 'var(--w)', color: 'var(--bg)',
          border: 'none', borderRadius: '10px', fontFamily: 'Inter', fontSize: '13.5px',
          fontWeight: 600, cursor: 'pointer',
        }}>
          Всё верно &#x2713;
        </button>
        <button onClick={onEdit} style={{
          flex: 1, padding: '11px', background: 'none', color: 'var(--d3)',
          border: '1px solid var(--l)', borderRadius: '10px', fontFamily: 'Inter',
          fontSize: '13.5px', cursor: 'pointer',
        }}>
          Дополнить
        </button>
      </div>
    </div>
  )
}
