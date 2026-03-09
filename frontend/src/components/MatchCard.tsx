import { useEffect, useRef } from 'react'

interface MatchCardProps {
  name: string
  age: number
  city: string
  personalityType: string
  profileText: string
  compatibilityScore: number
  photoUrl?: string
  onLike: () => void
  onPass: () => void
}

export default function MatchCard({
  name, age, city, personalityType, profileText,
  compatibilityScore, photoUrl, onLike, onPass,
}: MatchCardProps) {
  const fillRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setTimeout(() => {
      if (fillRef.current) {
        fillRef.current.style.width = `${compatibilityScore}%`
      }
    }, 400)
  }, [compatibilityScore])

  return (
    <div style={{
      background: 'var(--bg3)',
      border: '1px solid var(--l)',
      borderRadius: '20px',
      overflow: 'hidden',
      marginTop: '10px',
      maxWidth: '320px',
    }}>
      {/* Photo area */}
      <div style={{
        width: '100%', height: '175px', position: 'relative',
        background: 'linear-gradient(140deg,#0e1117 0%,#141b2d 60%,#0b1628 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
      }}>
        {photoUrl ? (
          <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ fontSize: '50px', position: 'relative', zIndex: 1 }}>&#x1F33F;</div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,.7), transparent 55%)',
        }} />
        <div style={{ position: 'absolute', bottom: '14px', left: '16px' }}>
          <div style={{ fontSize: '22px', fontWeight: 500, color: '#fff', letterSpacing: '-0.02em' }}>
            {name}, {age}
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.45)', marginTop: '2px' }}>
            {city}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          background: 'var(--d5)', border: '1px solid var(--l)', borderRadius: '100px',
          padding: '4px 10px', fontSize: '11px', color: 'var(--d3)', marginBottom: '10px',
        }}>
          &#x2726; {personalityType}
        </div>
        <div style={{ fontSize: '13.5px', lineHeight: 1.6, color: 'var(--d3)', marginBottom: '13px' }}>
          {profileText}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: '11px', color: 'var(--d3)', marginBottom: '7px',
        }}>
          <span>Совместимость</span>
          <span style={{ fontSize: '18px', fontWeight: 600, color: 'var(--d1)' }}>
            {compatibilityScore}%
          </span>
        </div>
        <div style={{
          height: '3px', background: 'var(--d5)', borderRadius: '10px', overflow: 'hidden',
        }}>
          <div ref={fillRef} style={{
            height: '100%', width: '0%',
            background: 'rgba(255,255,255,.4)', borderRadius: '10px',
            transition: 'width 1.2s cubic-bezier(.4,0,.2,1)',
          }} />
        </div>
      </div>

      {/* Actions */}
      <div style={{
        display: 'grid', gridTemplateColumns: '48px 1fr', gap: '8px', padding: '13px 16px 16px',
      }}>
        <button onClick={onPass} style={{
          padding: '13px 0', background: 'var(--d5)', border: '1px solid var(--l)',
          borderRadius: '12px', fontSize: '15px', cursor: 'pointer', color: 'var(--w)',
        }}>
          &#x1F44E;
        </button>
        <button onClick={onLike} style={{
          padding: '13px', background: 'var(--w)', color: 'var(--bg)', border: 'none',
          borderRadius: '12px', fontFamily: 'Inter', fontSize: '14px', fontWeight: 600,
          cursor: 'pointer',
        }}>
          Хочу познакомиться
        </button>
      </div>
    </div>
  )
}
