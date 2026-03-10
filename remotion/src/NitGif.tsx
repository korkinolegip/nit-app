import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'

// 960x540 @ 15fps, 90 frames = 6 seconds, seamless loop
// All sin() animations use period = 90 frames → exact loop

const BG = '#0b0b0b'
const BG3 = '#1c1c1c'
const L = 'rgba(255,255,255,0.06)'
const W = '#ffffff'
const D2 = 'rgba(255,255,255,0.60)'
const D3 = 'rgba(255,255,255,0.35)'
const D4 = 'rgba(255,255,255,0.18)'

const TOTAL = 90
const TWO_PI_OVER_TOTAL = (2 * Math.PI) / TOTAL

// Threads config for 960x540 landscape
const THREAD_CONFIGS = [
  { x: 432, height: 310, opacity: 0.85, speed: 1,   phase: 0  },
  { x: 460, height: 250, opacity: 0.55, speed: 2,   phase: 12 },
  { x: 495, height: 360, opacity: 0.35, speed: 1.5, phase: 24 },
  { x: 412, height: 195, opacity: 0.22, speed: 2.5, phase: 36 },
  { x: 518, height: 290, opacity: 0.16, speed: 1,   phase: 45 },
  { x: 390, height: 165, opacity: 0.11, speed: 2,   phase: 18 },
  { x: 540, height: 240, opacity: 0.09, speed: 1.5, phase: 60 },
]

const TAGLINES = [
  'Расскажи о себе — голосом или текстом',
  'AI поймёт, кого ты ищешь',
  'Совместимость в процентах — не угадывание',
]

export const NitGif = () => {
  const frame = useCurrentFrame()

  // ── Global fade in / out for seamless loop ──────────────────────
  const FADE_IN_END  = 12
  const FADE_OUT_START = 78
  const globalOpacity =
    frame < FADE_IN_END
      ? interpolate(frame, [0, FADE_IN_END], [0, 1], { extrapolateRight: 'clamp' })
      : frame > FADE_OUT_START
      ? interpolate(frame, [FADE_OUT_START, TOTAL], [1, 0], { extrapolateRight: 'clamp' })
      : 1

  // ── Orb pulse (1 full cycle = 90 frames → exact loop) ──────────
  const orbScale   = 1 + Math.sin(frame * TWO_PI_OVER_TOTAL) * 0.12
  const orbOpacity = 0.22 + Math.sin(frame * TWO_PI_OVER_TOTAL) * 0.08

  // ── Tagline rotation every 28 frames ──────────────────────────
  const taglineIndex = Math.floor((frame - FADE_IN_END) / 24) % TAGLINES.length
  const taglineFrame = (frame - FADE_IN_END) % 24
  const taglineOpacity =
    taglineFrame < 5
      ? interpolate(taglineFrame, [0, 5], [0, 1], { extrapolateRight: 'clamp' })
      : taglineFrame > 19
      ? interpolate(taglineFrame, [19, 24], [1, 0], { extrapolateRight: 'clamp' })
      : 1
  const safeTaglineOpacity = frame < FADE_IN_END ? 0 : taglineOpacity

  // ── Content fade in ─────────────────────────────────────────────
  const contentOpacity = interpolate(frame, [FADE_IN_END, FADE_IN_END + 10], [0, 1], {
    extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
  })

  return (
    <AbsoluteFill style={{ background: BG, overflow: 'hidden' }}>
      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `
          linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)
        `,
        backgroundSize: '44px 44px',
        maskImage: 'radial-gradient(ellipse 70% 70% at 45% 20%, black 5%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 45% 20%, black 5%, transparent 80%)',
        opacity: globalOpacity,
      }} />

      {/* Orb glow */}
      <div style={{
        position: 'absolute',
        width: 420, height: 420, borderRadius: '50%',
        top: -120, left: '42%', transform: `translateX(-50%) scale(${orbScale})`,
        background: 'radial-gradient(circle, rgba(255,255,255,0.08) 0%, transparent 65%)',
        opacity: orbOpacity * globalOpacity,
      }} />

      {/* Threads */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '100%', overflow: 'hidden', opacity: globalOpacity }}>
        {THREAD_CONFIGS.map((t, i) => {
          const angle = Math.sin(frame * TWO_PI_OVER_TOTAL * t.speed + t.phase) * 2.2
          return (
            <div key={i} style={{
              position: 'absolute',
              top: 0, left: t.x,
              width: 1.2, height: t.height,
              opacity: t.opacity,
              background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.65) 18%, rgba(255,255,255,0.22) 65%, transparent 100%)',
              transformOrigin: 'top center',
              transform: `rotate(${angle}deg)`,
            }} />
          )
        })}

        {/* Small glint dots at thread tops */}
        {[{ x: 432, o: 0.55 }, { x: 460, o: 0.35 }, { x: 495, o: 0.22 }].map((d, i) => (
          <div key={i} style={{
            position: 'absolute', top: 2, left: d.x - 1,
            width: 2.5, height: 2.5, borderRadius: '50%',
            background: 'rgba(255,255,255,0.7)', opacity: d.o,
          }} />
        ))}
      </div>

      {/* ── LEFT: Main content ───────────────────────────────────── */}
      <div style={{
        position: 'absolute', left: 0, top: 0, width: '58%', height: '100%',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center',
        padding: '0 0 0 64px',
        opacity: globalOpacity,
      }}>
        {/* НИТЬ label */}
        <div style={{
          opacity: contentOpacity,
          fontSize: 11, fontWeight: 500, letterSpacing: '0.32em',
          color: D4, textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 14,
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: 20,
        }}>
          <span style={{ height: 1, width: 24, background: D4, display: 'inline-block' }} />
          Н И Т Ь
          <span style={{ height: 1, width: 24, background: D4, display: 'inline-block' }} />
        </div>

        {/* Main headline */}
        <div style={{
          opacity: contentOpacity,
          fontSize: 52, fontWeight: 300, lineHeight: 1.08,
          letterSpacing: '-0.03em', color: W,
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: 20,
        }}>
          <span style={{ color: D3 }}>Найди</span>{'\u00a0'}
          <b style={{ fontWeight: 700 }}>своего</b>
          <br />человека
        </div>

        {/* Rotating tagline */}
        <div style={{ height: 28, position: 'relative', overflow: 'hidden', marginBottom: 28 }}>
          <div style={{
            opacity: safeTaglineOpacity,
            fontSize: 15, color: D3, fontWeight: 300,
            fontFamily: 'Inter, system-ui, sans-serif',
            lineHeight: 1.6,
            position: 'absolute',
          }}>
            {TAGLINES[Math.max(0, taglineIndex)]}
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          opacity: contentOpacity,
          display: 'flex', gap: 0,
          border: `1px solid ${L}`,
          borderRadius: 12,
          overflow: 'hidden',
          width: 'fit-content',
        }}>
          {[['94%', 'довольны'], ['3 мин', 'профиль'], ['AI', 'анализ']].map(([n, l], i) => (
            <div key={i} style={{
              padding: '10px 20px', textAlign: 'center',
              borderRight: i < 2 ? `1px solid ${L}` : 'none',
            }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: W, fontFamily: 'Inter' }}>{n}</div>
              <div style={{ fontSize: 10, color: D3, marginTop: 2, fontFamily: 'Inter', letterSpacing: '.04em' }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT: Phone mockup ──────────────────────────────────── */}
      <div style={{
        position: 'absolute', right: 40, top: '50%',
        transform: 'translateY(-50%)',
        opacity: globalOpacity * interpolate(frame, [FADE_IN_END + 4, FADE_IN_END + 18], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
      }}>
        {/* Phone frame */}
        <div style={{
          width: 168, height: 340,
          borderRadius: 28,
          background: BG3,
          border: '1.5px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.03)',
          overflow: 'hidden',
          position: 'relative',
        }}>
          {/* Notch */}
          <div style={{
            position: 'absolute', top: 7, left: '50%', transform: 'translateX(-50%)',
            width: 44, height: 12, borderRadius: 8, background: '#000', zIndex: 5,
          }} />

          {/* Chat screen */}
          <div style={{ background: BG, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
              padding: '26px 10px 8px',
              borderBottom: `1px solid ${L}`,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.4)' }} />
              <div style={{ fontSize: 7, fontWeight: 600, color: W, letterSpacing: '.06em', fontFamily: 'Inter' }}>НИТЬ</div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {/* AI bubble */}
              <div style={{
                opacity: interpolate(frame, [20, 30], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
                background: BG3, border: `1px solid ${L}`,
                borderRadius: '8px 8px 8px 2px',
                padding: '6px 8px', fontSize: 6.5, color: D2,
                fontFamily: 'Inter', lineHeight: 1.5, maxWidth: '85%',
              }}>
                Привет! Расскажи о себе — кто ты, чем занимаешься?
              </div>

              {/* Voice bubble (user) */}
              <div style={{
                opacity: interpolate(frame, [35, 45], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
                alignSelf: 'flex-end',
                background: 'rgba(255,255,255,0.09)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: '8px 8px 2px 8px',
                padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontSize: 7 }}>🎤</span>
                {[0.5, 0.9, 0.6, 1, 0.7, 0.8, 0.5].map((h, i) => {
                  const wave = Math.sin((frame * TWO_PI_OVER_TOTAL * 3) + i * 0.8) * 0.3 + 0.7
                  return (
                    <div key={i} style={{
                      width: 1.5, height: h * 10 * wave, borderRadius: 1,
                      background: 'rgba(255,255,255,0.6)',
                    }} />
                  )
                })}
              </div>

              {/* AI response */}
              <div style={{
                opacity: interpolate(frame, [52, 62], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
                background: BG3, border: `1px solid ${L}`,
                borderRadius: '8px 8px 8px 2px',
                padding: '6px 8px', fontSize: 6.5, color: D2,
                fontFamily: 'Inter', lineHeight: 1.5, maxWidth: '90%',
              }}>
                Понял тебя. Подбираю совместимых людей...
              </div>

              {/* Match badge */}
              <div style={{
                opacity: interpolate(frame, [65, 75], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, padding: '6px 8px',
                fontSize: 7, color: W, fontFamily: 'Inter',
                textAlign: 'center', fontWeight: 600,
              }}>
                ✦ Найдено совпадение · 87%
              </div>
            </div>

            {/* Input */}
            <div style={{
              padding: '5px 7px 10px',
              borderTop: `1px solid ${L}`,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <div style={{
                flex: 1, height: 18, borderRadius: 9,
                background: BG3, border: `1px solid ${L}`,
              }} />
              <div style={{
                width: 18, height: 18, borderRadius: '50%',
                background: W, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 8,
                transform: `scale(${1 + Math.sin(frame * TWO_PI_OVER_TOTAL * 2) * 0.06})`,
              }}>🎤</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: CTA hint */}
      <div style={{
        position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
        opacity: globalOpacity * interpolate(frame, [FADE_IN_END + 8, FADE_IN_END + 20], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
        fontSize: 12, color: D4, fontFamily: 'Inter', letterSpacing: '.06em',
        textTransform: 'uppercase', whiteSpace: 'nowrap',
      }}>
        Нажми Start · Без свайпов · Без анкет
      </div>
    </AbsoluteFill>
  )
}
