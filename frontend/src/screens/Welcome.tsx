import { useRef, useState, useEffect } from 'react'
import Thread from '../components/Thread'
import { useGyroscope } from '../hooks/useGyroscope'

const TAGLINES = [
  'Партнёра. Друга. Единомышленника.',
  'Того, с кем не надо притворяться',
  'Коллегу. Напарника. Половинку.',
  'Того, с кем тишина не неловкая',
  'Друга для хобби. Попутчика. Свою.',
]

interface WelcomeProps {
  onStart: () => void
}

export default function Welcome({ onStart }: WelcomeProps) {
  const threadRefs = useRef<(HTMLDivElement | null)[]>([])
  const [taglineIdx, setTaglineIdx] = useState(0)
  const [taglineState, setTaglineState] = useState<'on' | 'out'>('on')

  useGyroscope(threadRefs as any)

  useEffect(() => {
    const interval = setInterval(() => {
      setTaglineState('out')
      setTimeout(() => {
        setTaglineIdx(prev => (prev + 1) % TAGLINES.length)
        setTaglineState('on')
      }, 560)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: 'var(--bg)', justifyContent: 'space-between', overflow: 'hidden',
      position: 'relative',
    }}>
      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: `
          linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)
        `,
        backgroundSize: '44px 44px',
        maskImage: 'radial-gradient(ellipse 90% 60% at 50% 25%, black 10%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse 90% 60% at 50% 25%, black 10%, transparent 100%)',
      }} />

      {/* Orb */}
      <div style={{
        position: 'absolute', width: '320px', height: '320px', borderRadius: '50%',
        top: '-90px', left: '50%', transform: 'translateX(-50%)',
        background: 'radial-gradient(circle, rgba(255,255,255,.05) 0%, transparent 65%)',
        pointerEvents: 'none', animation: 'orbp 8s ease-in-out infinite',
      }} />

      {/* Threads */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: 0, height: '60%',
        pointerEvents: 'none', overflow: 'hidden',
      }}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <Thread key={i} index={i} ref={el => { threadRefs.current[i] = el }} />
        ))}
      </div>

      {/* Content */}
      <div style={{
        position: 'relative', zIndex: 2, flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '64px 28px 16px',
      }}>
        <div style={{
          fontSize: '11px', fontWeight: 500, letterSpacing: '.28em',
          textTransform: 'uppercase' as const, color: 'var(--d3)',
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px',
        }}>
          <span style={{ height: '1px', width: '22px', background: 'var(--d4)', display: 'inline-block' }} />
          &#1053; &#1048; &#1058; &#1068;
          <span style={{ height: '1px', width: '22px', background: 'var(--d4)', display: 'inline-block' }} />
        </div>

        <h1 style={{
          fontSize: '43px', fontWeight: 300, lineHeight: 1.08,
          letterSpacing: '-0.032em', color: 'var(--w)', marginBottom: '18px',
        }}>
          <span style={{ color: 'var(--d3)' }}>Найди</span>{' '}
          <b style={{ fontWeight: 600 }}>своего</b><br />
          человека
        </h1>

        {/* Rotating taglines */}
        <div style={{ height: '42px', overflow: 'hidden', position: 'relative', marginBottom: '14px', width: '100%' }}>
          <div style={{
            position: 'absolute', width: '100%', textAlign: 'center',
            fontSize: '13px', lineHeight: 1.55, color: 'var(--d3)', fontWeight: 300,
            transition: 'all .55s cubic-bezier(.4,0,.2,1)',
            opacity: taglineState === 'on' ? 1 : 0,
            transform: taglineState === 'on' ? 'translateY(0)' : 'translateY(-10px)',
          }}>
            {TAGLINES[taglineIdx]}
          </div>
        </div>

        <p style={{
          fontSize: '13px', lineHeight: 1.7, color: 'var(--d3)', fontWeight: 300, maxWidth: '240px',
        }}>
          Просто расскажи о себе — голосом или текстом.<br />
          AI-агент поймёт кого ты ищешь.
        </p>
      </div>

      {/* Footer */}
      <div style={{ position: 'relative', zIndex: 2, padding: '0 22px 44px' }}>
        <div style={{
          display: 'flex', border: '1px solid var(--l)', borderRadius: '14px',
          overflow: 'hidden', marginBottom: '18px',
        }}>
          {[
            { n: '94%', l: 'довольны' },
            { n: '3 мин', l: 'на профиль' },
            { n: 'AI', l: 'анализ' },
          ].map((stat, i) => (
            <div key={i} style={{
              flex: 1, padding: '13px 10px', textAlign: 'center',
              borderRight: i < 2 ? '1px solid var(--l)' : 'none',
            }}>
              <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--w)' }}>{stat.n}</div>
              <div style={{ fontSize: '10px', color: 'var(--d3)', marginTop: '2px', letterSpacing: '.04em' }}>{stat.l}</div>
            </div>
          ))}
        </div>

        <button onClick={onStart} style={{
          width: '100%', padding: '16px', background: 'var(--w)', color: 'var(--bg)',
          border: 'none', borderRadius: '13px', fontFamily: 'Inter', fontSize: '15px',
          fontWeight: 600, cursor: 'pointer',
        }}>
          Начать
        </button>

        <p style={{ textAlign: 'center', marginTop: '11px', fontSize: '12px', color: 'var(--d3)' }}>
          Без свайпов &middot; Без анкет &middot; Просто разговор
        </p>
      </div>

      <style>{`
        @keyframes orbp {
          0%, 100% { opacity: .7; transform: translateX(-50%) scale(1); }
          50% { opacity: .25; transform: translateX(-50%) scale(1.15); }
        }
        @keyframes sw1 { 0%, 100% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } }
        @keyframes sw2 { 0%, 100% { transform: rotate(1deg); } 50% { transform: rotate(-1deg); } }
        @keyframes rp { 0%, 100% { opacity: 1; } 50% { opacity: .2; } }
        @keyframes mp { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
      `}</style>
    </div>
  )
}
