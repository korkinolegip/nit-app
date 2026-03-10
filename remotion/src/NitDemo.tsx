import {
  AbsoluteFill,
  Easing,
  interpolate,
  Sequence,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

// ─── Palette ────────────────────────────────────────────────────────────────
const BG  = '#0b0b0b'
const BG2 = '#141414'
const BG3 = '#1c1c1c'
const L   = 'rgba(255,255,255,0.07)'
const W   = '#ffffff'
const D1  = 'rgba(255,255,255,0.88)'
const D2  = 'rgba(255,255,255,0.60)'
const D3  = 'rgba(255,255,255,0.35)'
const D4  = 'rgba(255,255,255,0.18)'
const ACCENT = 'rgba(255,255,255,0.92)'

// ─── Scene timing (frames @ 30fps) ──────────────────────────────────────────
// 0   – 90   (3s)  Intro: logo + threads
// 90  – 240  (5s)  Hook: "не свайпы"
// 240 – 450  (7s)  Chat: AI разговор
// 450 – 600  (5s)  Match: совместимость + карточка
// 600 – 750  (5s)  Profile: данные человека
// 750 – 870  (4s)  Outro: logo + CTA
const TOTAL = 870

// ─── Helpers ────────────────────────────────────────────────────────────────
function useFadeIn(delay = 0, dur = 20) {
  const frame = useCurrentFrame()
  return interpolate(frame, [delay, delay + dur], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
}

function useSlideUp(delay = 0, distance = 40) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const p = spring({ frame: frame - delay, fps, config: { damping: 18, mass: 0.6, stiffness: 120 } })
  const opacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  return { transform: `translateY(${(1 - p) * distance}px)`, opacity }
}

// ─── Thread component ────────────────────────────────────────────────────────
function AnimThread({ x, height, opacity, phase, speed }: {
  x: number; height: number; opacity: number; phase: number; speed: number
}) {
  const frame = useCurrentFrame()
  const angle = Math.sin((frame * speed + phase) * 0.04) * 2.5
  return (
    <div style={{
      position: 'absolute',
      left: x, top: 0,
      width: 1.5, height,
      opacity,
      background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,0.7) 15%, rgba(255,255,255,0.25) 65%, transparent 100%)',
      transformOrigin: 'top center',
      transform: `rotate(${angle}deg)`,
    }} />
  )
}

function Threads({ count = 7 }: { count?: number }) {
  const configs = [
    { x: 490, h: 680, o: 0.85, ph: 0,   sp: 1.0 },
    { x: 520, h: 540, o: 0.55, ph: 20,  sp: 0.8 },
    { x: 555, h: 780, o: 0.35, ph: 40,  sp: 1.2 },
    { x: 460, h: 420, o: 0.25, ph: 10,  sp: 0.9 },
    { x: 590, h: 600, o: 0.18, ph: 55,  sp: 1.4 },
    { x: 430, h: 320, o: 0.12, ph: 30,  sp: 0.7 },
    { x: 615, h: 480, o: 0.10, ph: 70,  sp: 1.1 },
  ].slice(0, count)

  return (
    <>
      {configs.map((c, i) => (
        <AnimThread key={i} x={c.x} height={c.h} opacity={c.o} phase={c.ph} speed={c.sp} />
      ))}
    </>
  )
}

// ─── Phone Mockup ────────────────────────────────────────────────────────────
function Phone({ children, scale = 1 }: { children: React.ReactNode; scale?: number }) {
  return (
    <div style={{
      width: 380 * scale, height: 760 * scale,
      borderRadius: 52 * scale,
      background: BG2,
      border: `2px solid rgba(255,255,255,0.12)`,
      boxShadow: '0 60px 140px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
      overflow: 'hidden',
      position: 'relative',
      flexShrink: 0,
    }}>
      {/* Notch */}
      <div style={{
        position: 'absolute', top: 14 * scale, left: '50%',
        transform: 'translateX(-50%)',
        width: 100 * scale, height: 28 * scale,
        borderRadius: 20 * scale,
        background: '#000', zIndex: 10,
      }} />
      {/* Screen content */}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 52 * scale, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  )
}

// ─── Chat bubble ────────────────────────────────────────────────────────────
function Bubble({ text, from, delay, scale = 1 }: {
  text: string; from: 'ai' | 'user'; delay: number; scale?: number
}) {
  const style = useSlideUp(delay, 20)
  const isAI = from === 'ai'
  return (
    <div style={{ ...style, display: 'flex', justifyContent: isAI ? 'flex-start' : 'flex-end', marginBottom: 10 * scale }}>
      <div style={{
        maxWidth: '78%',
        background: isAI ? BG3 : 'rgba(255,255,255,0.10)',
        border: `1px solid ${isAI ? L : 'rgba(255,255,255,0.14)'}`,
        borderRadius: 18 * scale,
        borderBottomLeftRadius: isAI ? 4 * scale : 18 * scale,
        borderBottomRightRadius: isAI ? 18 * scale : 4 * scale,
        padding: `${12 * scale}px ${16 * scale}px`,
        fontSize: 15 * scale,
        lineHeight: 1.6,
        color: isAI ? D1 : W,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 300,
      }}>
        {text}
      </div>
    </div>
  )
}

// ─── Voice message bubble ─────────────────────────────────────────────────
function VoiceBubble({ delay, scale = 1 }: { delay: number; scale?: number }) {
  const style = useSlideUp(delay, 20)
  const frame = useCurrentFrame()
  const bars = [0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.4, 0.7, 1, 0.6, 0.8]
  return (
    <div style={{ ...style, display: 'flex', justifyContent: 'flex-end', marginBottom: 10 * scale }}>
      <div style={{
        background: 'rgba(255,255,255,0.10)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 18 * scale,
        borderBottomRightRadius: 4 * scale,
        padding: `${12 * scale}px ${16 * scale}px`,
        display: 'flex', alignItems: 'center', gap: 3 * scale,
      }}>
        {/* Mic icon */}
        <div style={{ fontSize: 14 * scale, marginRight: 4 * scale }}>🎤</div>
        {/* Waveform bars */}
        {bars.map((h, i) => {
          const anim = Math.sin((frame * 0.3 + i * 0.6)) * 0.3 + 0.7
          return (
            <div key={i} style={{
              width: 3 * scale,
              height: h * 24 * scale * anim,
              borderRadius: 2 * scale,
              background: 'rgba(255,255,255,0.7)',
              transition: 'height 0.1s',
            }} />
          )
        })}
        <div style={{ fontSize: 12 * scale, color: D3, marginLeft: 4 * scale, fontFamily: 'Inter' }}>0:04</div>
      </div>
    </div>
  )
}

// ─── SCENE 1: INTRO ──────────────────────────────────────────────────────────
function SceneIntro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoSpring = spring({ frame: frame - 15, fps, config: { damping: 16, mass: 0.7 } })
  const logoY = interpolate(logoSpring, [0, 1], [60, 0])
  const logoOpacity = interpolate(frame, [15, 40], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  const tagOpacity = interpolate(frame, [40, 65], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  const tagY = interpolate(frame, [40, 70], [20, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  const subOpacity = interpolate(frame, [60, 85], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  // Orb pulse
  const orbScale = 1 + Math.sin(frame * 0.05) * 0.08
  const orbOpacity = 0.3 + Math.sin(frame * 0.04) * 0.1

  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)`,
        backgroundSize: '52px 52px',
        maskImage: 'radial-gradient(ellipse 80% 50% at 50% 20%, black 5%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 50% at 50% 20%, black 5%, transparent 80%)',
      }} />

      {/* Orb */}
      <div style={{
        position: 'absolute',
        width: 500, height: 500,
        borderRadius: '50%',
        top: -100, left: '50%',
        transform: `translateX(-50%) scale(${orbScale})`,
        background: 'radial-gradient(circle, rgba(255,255,255,0.07) 0%, transparent 65%)',
        opacity: orbOpacity,
      }} />

      {/* Threads */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '55%', overflow: 'hidden' }}>
        <Threads />
      </div>

      {/* Content */}
      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 80px',
      }}>
        {/* НИТЬ label */}
        <div style={{
          opacity: logoOpacity,
          transform: `translateY(${logoY}px)`,
          fontSize: 13, fontWeight: 500, letterSpacing: '0.35em',
          color: D3, textTransform: 'uppercase',
          display: 'flex', alignItems: 'center', gap: 20,
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: 32,
        }}>
          <span style={{ height: 1, width: 36, background: D4, display: 'inline-block' }} />
          Н И Т Ь
          <span style={{ height: 1, width: 36, background: D4, display: 'inline-block' }} />
        </div>

        {/* Main headline */}
        <div style={{
          opacity: logoOpacity,
          transform: `translateY(${logoY}px)`,
          fontSize: 96, fontWeight: 300, lineHeight: 1.05,
          letterSpacing: '-0.03em', color: W,
          textAlign: 'center',
          fontFamily: 'Inter, system-ui, sans-serif',
          marginBottom: 24,
        }}>
          <span style={{ color: D3 }}>Найди</span>{'\u00a0'}
          <b style={{ fontWeight: 700 }}>своего</b>
          <br />человека
        </div>

        {/* Tagline */}
        <div style={{
          opacity: tagOpacity,
          transform: `translateY(${tagY}px)`,
          fontSize: 28, color: D3, fontWeight: 300,
          textAlign: 'center', lineHeight: 1.6,
          fontFamily: 'Inter, system-ui, sans-serif',
          maxWidth: 580,
          marginBottom: 48,
        }}>
          Не свайпами.<br />Не анкетами.<br />Просто разговором.
        </div>

        {/* Stats row */}
        <div style={{
          opacity: subOpacity,
          display: 'flex', gap: 0,
          border: `1px solid ${L}`,
          borderRadius: 20,
          overflow: 'hidden',
        }}>
          {[['94%', 'довольны'], ['3 мин', 'на профиль'], ['AI', 'анализ']].map(([n, l], i) => (
            <div key={i} style={{
              padding: '22px 44px', textAlign: 'center',
              borderRight: i < 2 ? `1px solid ${L}` : 'none',
            }}>
              <div style={{ fontSize: 34, fontWeight: 700, color: W, fontFamily: 'Inter' }}>{n}</div>
              <div style={{ fontSize: 16, color: D3, marginTop: 4, fontFamily: 'Inter', letterSpacing: '.04em' }}>{l}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ─── SCENE 2: HOOK ──────────────────────────────────────────────────────────
function SceneHook() {
  const frame = useCurrentFrame()

  const items = [
    { bad: 'Свайпы — лотерея', good: 'AI понимает тебя', delay: 10 },
    { bad: 'Анкеты — маска', good: 'Разговор — суть', delay: 45 },
    { bad: 'Совпадение = удача', good: '87% совместимости', delay: 80 },
  ]

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 80px' }}>
      {/* Top label */}
      <div style={{
        ...useSlideUp(0, 15),
        fontSize: 14, letterSpacing: '.25em', color: D4,
        textTransform: 'uppercase', fontFamily: 'Inter', marginBottom: 80,
      }}>
        Почему НИТЬ
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 32 }}>
        {items.map(({ bad, good, delay }) => {
          const progress = interpolate(frame, [delay, delay + 30], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
          const slideY = interpolate(progress, [0, 1], [30, 0])
          return (
            <div key={bad} style={{
              opacity: progress,
              transform: `translateY(${slideY}px)`,
              display: 'flex', alignItems: 'center', gap: 24,
            }}>
              {/* Bad */}
              <div style={{
                flex: 1, padding: '28px 32px',
                background: 'rgba(255,70,70,0.06)',
                border: '1px solid rgba(255,70,70,0.15)',
                borderRadius: 20,
              }}>
                <div style={{ fontSize: 14, color: 'rgba(255,100,100,0.7)', marginBottom: 6, fontFamily: 'Inter', letterSpacing: '.05em' }}>РАНЬШЕ</div>
                <div style={{ fontSize: 26, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter', fontWeight: 400, textDecoration: 'line-through', textDecorationColor: 'rgba(255,100,100,0.4)' }}>
                  {bad}
                </div>
              </div>

              {/* Arrow */}
              <div style={{ fontSize: 28, color: D4 }}>→</div>

              {/* Good */}
              <div style={{
                flex: 1, padding: '28px 32px',
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid ${L}`,
                borderRadius: 20,
              }}>
                <div style={{ fontSize: 14, color: D3, marginBottom: 6, fontFamily: 'Inter', letterSpacing: '.05em' }}>НИТЬ</div>
                <div style={{ fontSize: 26, color: W, fontFamily: 'Inter', fontWeight: 600 }}>
                  {good}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ─── SCENE 3: CHAT ───────────────────────────────────────────────────────────
function SceneChat() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const phoneSpring = spring({ frame: frame - 5, fps, config: { damping: 18, mass: 0.8 } })
  const phoneY = interpolate(phoneSpring, [0, 1], [120, 0])
  const phoneOpacity = interpolate(frame, [5, 30], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  const labelOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 50 }}>
      {/* Label above */}
      <div style={{
        opacity: labelOpacity,
        fontSize: 30, color: D3, fontFamily: 'Inter', fontWeight: 300,
        letterSpacing: '.04em', textAlign: 'center',
      }}>
        Расскажи о себе — голосом или текстом
      </div>

      {/* Phone */}
      <div style={{ opacity: phoneOpacity, transform: `translateY(${phoneY}px)` }}>
        <Phone scale={1.15}>
          {/* Chat screen inside phone */}
          <div style={{ background: BG, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{
              padding: '56px 20px 14px',
              borderBottom: `1px solid ${L}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: 'rgba(255,255,255,0.4)',
                animation: 'none',
              }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: W, letterSpacing: '.04em', fontFamily: 'Inter' }}>
                НИТЬ
              </div>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, padding: '20px 16px', display: 'flex', flexDirection: 'column', overflowY: 'hidden' }}>
              <Bubble text="Привет! Я Нить — твой AI-собеседник. Расскажи о себе — кто ты, чем занимаешься, что ищешь?" from="ai" delay={10} scale={0.88} />
              <VoiceBubble delay={45} scale={0.88} />
              <Bubble text="Слышу тебя. Ты аналитик, любишь горы и ищешь человека, с которым можно молчать и не чувствовать неловкости." from="ai" delay={85} scale={0.88} />
              <Bubble text="Именно так 🎯" from="user" delay={125} scale={0.88} />
            </div>

            {/* Input bar */}
            <div style={{
              padding: '10px 12px 20px',
              borderTop: `1px solid ${L}`,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                flex: 1, height: 40, borderRadius: 20,
                background: BG3, border: `1px solid ${L}`,
                display: 'flex', alignItems: 'center',
                paddingLeft: 16,
              }}>
                <div style={{ fontSize: 13, color: D4, fontFamily: 'Inter' }}>Написать...</div>
              </div>
              {/* Mic button - pulsing */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: W, display: 'flex', alignItems: 'center', justifyContent: 'center',
                transform: `scale(${1 + Math.sin(frame * 0.15) * 0.07})`,
                boxShadow: `0 0 ${12 + Math.sin(frame * 0.15) * 6}px rgba(255,255,255,0.25)`,
              }}>
                <div style={{ fontSize: 17 }}>🎤</div>
              </div>
            </div>
          </div>
        </Phone>
      </div>

      {/* Label below */}
      <div style={{
        opacity: interpolate(frame, [60, 90], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
        fontSize: 26, color: D3, fontFamily: 'Inter', fontWeight: 300,
        textAlign: 'center', maxWidth: 700,
      }}>
        AI запоминает всё — и знает тебя лучше анкеты
      </div>
    </AbsoluteFill>
  )
}

// ─── SCENE 4: MATCH ──────────────────────────────────────────────────────────
function SceneMatch() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // Counter from 0 to 87
  const counterProgress = interpolate(frame, [10, 90], [0, 1], {
    extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
    easing: Easing.out(Easing.cubic),
  })
  const counterValue = Math.round(counterProgress * 87)

  // Card spring
  const cardSpring = spring({ frame: frame - 95, fps, config: { damping: 18, mass: 0.9 } })
  const cardY = interpolate(cardSpring, [0, 1], [200, 0])
  const cardOpacity = interpolate(frame, [95, 115], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  const labelOpacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  const mutualOpacity = interpolate(frame, [115, 140], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 40, padding: '0 60px' }}>
      {/* Label */}
      <div style={{
        opacity: labelOpacity,
        fontSize: 28, color: D3, fontFamily: 'Inter', fontWeight: 300, textAlign: 'center',
      }}>
        Алгоритм нашёл тебе пару
      </div>

      {/* Big counter */}
      <div style={{ opacity: labelOpacity, textAlign: 'center' }}>
        <div style={{
          fontSize: 180, fontWeight: 800, color: W,
          fontFamily: 'Inter', lineHeight: 1,
          letterSpacing: '-0.04em',
        }}>
          {counterValue}
          <span style={{ fontSize: 80, fontWeight: 300, color: D3 }}>%</span>
        </div>
        <div style={{ fontSize: 22, color: D3, fontFamily: 'Inter', letterSpacing: '.06em', marginTop: 4 }}>
          СОВМЕСТИМОСТЬ
        </div>
      </div>

      {/* Match card */}
      <div style={{
        opacity: cardOpacity, transform: `translateY(${cardY}px)`,
        width: '100%', background: BG3,
        border: `1px solid rgba(255,255,255,0.1)`,
        borderRadius: 28, overflow: 'hidden',
      }}>
        {/* Photo placeholder */}
        <div style={{
          height: 240,
          background: `linear-gradient(145deg, #1f1f1f 0%, #262626 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          {/* Silhouette */}
          <div style={{ fontSize: 80, opacity: 0.3 }}>👤</div>
          {/* Badge */}
          <div style={{
            position: 'absolute', top: 14, right: 14,
            background: 'rgba(0,0,0,0.7)',
            borderRadius: 24, padding: '7px 16px',
            fontSize: 20, fontWeight: 800, color: W,
            backdropFilter: 'blur(8px)',
          }}>
            {counterValue}%
          </div>
        </div>
        {/* Info */}
        <div style={{ padding: '20px 24px 24px' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: W, fontFamily: 'Inter', marginBottom: 4 }}>
            Анна, 28
          </div>
          <div style={{ fontSize: 17, color: D3, fontFamily: 'Inter', marginBottom: 14 }}>
            Москва · UX-дизайнер
          </div>
          <div style={{ fontSize: 15, color: D2, fontFamily: 'Inter', lineHeight: 1.6, fontStyle: 'italic' }}>
            "Оба цените тишину и пространство. Горы, аналитический склад ума и желание говорить о важном."
          </div>
        </div>
      </div>

      {/* Mutual match badge */}
      <div style={{
        opacity: mutualOpacity,
        background: 'rgba(255,255,255,0.07)',
        border: `1px solid rgba(255,255,255,0.15)`,
        borderRadius: 20, padding: '16px 40px',
        fontSize: 22, color: W, fontFamily: 'Inter', fontWeight: 500,
        textAlign: 'center',
        transform: `scale(${0.95 + mutualOpacity * 0.05})`,
      }}>
        ✦ Взаимный матч — открылся чат
      </div>
    </AbsoluteFill>
  )
}

// ─── SCENE 5: PROFILE ────────────────────────────────────────────────────────
function SceneProfile() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const phoneSpring = spring({ frame: frame - 5, fps, config: { damping: 18, mass: 0.8 } })
  const phoneY = interpolate(phoneSpring, [0, 1], [100, 0])
  const phoneOpacity = interpolate(frame, [5, 28], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })

  const chips = [
    { icon: '📍', text: 'Москва', delay: 30 },
    { icon: '💼', text: 'UX-дизайнер', delay: 42 },
    { icon: '🎯', text: 'Серьёзные', delay: 54 },
    { icon: '🧠', text: 'INFJ', delay: 66 },
    { icon: '🔗', text: 'Надёжный тип', delay: 78 },
  ]

  return (
    <AbsoluteFill style={{ background: BG, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 44 }}>
      <div style={{
        opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
        fontSize: 30, color: D3, fontFamily: 'Inter', fontWeight: 300, textAlign: 'center',
      }}>
        Полный профиль — до первого слова
      </div>

      <div style={{ opacity: phoneOpacity, transform: `translateY(${phoneY}px)` }}>
        <Phone scale={1.1}>
          <div style={{ background: BG, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Photo area */}
            <div style={{
              height: '45%', background: `linear-gradient(160deg, #1e1e1e, #252525)`,
              position: 'relative', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ fontSize: 72, opacity: 0.25 }}>👤</div>
              {/* Back btn */}
              <div style={{
                position: 'absolute', top: 52, left: 14,
                width: 36, height: 36, borderRadius: '50%',
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 16 }}>←</div>
              </div>
              {/* Badge */}
              <div style={{
                position: 'absolute', top: 52, right: 14,
                background: 'rgba(0,0,0,0.65)', borderRadius: 20, padding: '5px 14px',
                fontSize: 15, fontWeight: 800, color: W, backdropFilter: 'blur(4px)',
              }}>
                87%
              </div>
            </div>

            {/* Info */}
            <div style={{ flex: 1, padding: '18px 16px', overflowY: 'hidden' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: W, fontFamily: 'Inter', marginBottom: 10 }}>
                Анна, 28
              </div>
              {/* Chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                {chips.map(({ icon, text, delay }) => {
                  const chipOpacity = interpolate(frame, [delay, delay + 15], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
                  const chipY = interpolate(frame, [delay, delay + 15], [12, 0], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
                  return (
                    <div key={text} style={{
                      opacity: chipOpacity, transform: `translateY(${chipY}px)`,
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: BG3, border: `1px solid ${L}`,
                      borderRadius: 20, padding: '5px 10px',
                      fontSize: 12, color: D2, fontFamily: 'Inter',
                    }}>
                      <span style={{ fontSize: 11 }}>{icon}</span>
                      {text}
                    </div>
                  )
                })}
              </div>

              {/* AI block */}
              <div style={{
                opacity: interpolate(frame, [90, 110], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
                padding: '12px 14px',
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${L}`,
                borderRadius: 14, fontSize: 12, color: D2,
                fontFamily: 'Inter', lineHeight: 1.6, fontStyle: 'italic',
              }}>
                "Оба цените тишину. Горы, аналитический склад ума — редкое сочетание."
              </div>
            </div>
          </div>
        </Phone>
      </div>

      <div style={{
        opacity: interpolate(frame, [100, 125], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }),
        fontSize: 26, color: D3, fontFamily: 'Inter', fontWeight: 300, textAlign: 'center', maxWidth: 700,
      }}>
        Личность, ценности, стиль привязанности — всё уже известно
      </div>
    </AbsoluteFill>
  )
}

// ─── SCENE 6: OUTRO ──────────────────────────────────────────────────────────
function SceneOutro() {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const logoSpring = spring({ frame: frame - 10, fps, config: { damping: 16, mass: 0.7 } })
  const logoOpacity = interpolate(frame, [10, 35], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  const logoY = interpolate(logoSpring, [0, 1], [50, 0])

  const tagOpacity = interpolate(frame, [35, 58], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  const bulletOpacity = interpolate(frame, [60, 85], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  const ctaOpacity = interpolate(frame, [80, 110], [0, 1], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  const ctaScale = 0.95 + ctaOpacity * 0.05

  // Orb pulse
  const orbScale = 1 + Math.sin(frame * 0.05) * 0.1
  const orbOpacity = 0.25 + Math.sin(frame * 0.04) * 0.08

  return (
    <AbsoluteFill style={{ background: BG }}>
      {/* Grid */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)`,
        backgroundSize: '52px 52px',
        maskImage: 'radial-gradient(ellipse 80% 60% at 50% 25%, black 5%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 25%, black 5%, transparent 80%)',
      }} />

      {/* Orb */}
      <div style={{
        position: 'absolute', width: 600, height: 600, borderRadius: '50%',
        top: -120, left: '50%',
        transform: `translateX(-50%) scale(${orbScale})`,
        background: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 65%)',
        opacity: orbOpacity,
      }} />

      {/* Threads */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '50%', overflow: 'hidden' }}>
        <Threads />
      </div>

      <AbsoluteFill style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 80px', gap: 0,
      }}>
        {/* НИТЬ */}
        <div style={{
          opacity: logoOpacity, transform: `translateY(${logoY}px)`,
          fontSize: 14, fontWeight: 500, letterSpacing: '.35em', color: D4,
          display: 'flex', alignItems: 'center', gap: 22,
          fontFamily: 'Inter', marginBottom: 28,
        }}>
          <span style={{ height: 1, width: 40, background: D4, display: 'inline-block' }} />
          Н И Т Ь
          <span style={{ height: 1, width: 40, background: D4, display: 'inline-block' }} />
        </div>

        <div style={{
          opacity: logoOpacity, transform: `translateY(${logoY}px)`,
          fontSize: 100, fontWeight: 300, lineHeight: 1.05,
          letterSpacing: '-0.03em', color: W, textAlign: 'center',
          fontFamily: 'Inter', marginBottom: 20,
        }}>
          <span style={{ color: D3 }}>Найди</span>{'\u00a0'}
          <b style={{ fontWeight: 700 }}>своего</b>
          <br />человека
        </div>

        <div style={{ opacity: tagOpacity, marginBottom: 56 }}>
          <div style={{
            fontSize: 26, color: D2, fontFamily: 'Inter', fontWeight: 300,
            textAlign: 'center', lineHeight: 1.8,
          }}>
            Без свайпов &middot; Без анкет &middot; Просто разговор
          </div>
        </div>

        {/* Divider */}
        <div style={{ opacity: bulletOpacity, width: 64, height: 1, background: L, marginBottom: 44 }} />

        {/* CTA */}
        <div style={{
          opacity: ctaOpacity, transform: `scale(${ctaScale})`,
          padding: '26px 80px',
          background: W, borderRadius: 20,
          fontSize: 28, fontWeight: 700, color: BG,
          fontFamily: 'Inter', letterSpacing: '.01em',
          boxShadow: '0 20px 60px rgba(255,255,255,0.12)',
        }}>
          Попробуй в Telegram
        </div>

        <div style={{
          opacity: ctaOpacity, marginTop: 18,
          fontSize: 17, color: D4, fontFamily: 'Inter',
        }}>
          @NitMatch_bot
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ─── Transition ───────────────────────────────────────────────────────────────
function FadeTransition({ durationInFrames = 20 }: { durationInFrames?: number }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, durationInFrames], [1, 0], { extrapolateRight: 'clamp' })
  return <AbsoluteFill style={{ background: BG, opacity }} />
}

// ─── ROOT COMPOSITION ────────────────────────────────────────────────────────
export const NitDemo = () => {
  return (
    <AbsoluteFill style={{ background: BG, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Scene 1: Intro  0–90 */}
      <Sequence from={0} durationInFrames={100}>
        <SceneIntro />
      </Sequence>

      {/* Fade out */}
      <Sequence from={80} durationInFrames={20}>
        <FadeTransition />
      </Sequence>

      {/* Scene 2: Hook  90–240 */}
      <Sequence from={90} durationInFrames={160}>
        <SceneHook />
      </Sequence>

      <Sequence from={230} durationInFrames={20}>
        <FadeTransition />
      </Sequence>

      {/* Scene 3: Chat  240–450 */}
      <Sequence from={240} durationInFrames={220}>
        <SceneChat />
      </Sequence>

      <Sequence from={440} durationInFrames={20}>
        <FadeTransition />
      </Sequence>

      {/* Scene 4: Match  450–600 */}
      <Sequence from={450} durationInFrames={160}>
        <SceneMatch />
      </Sequence>

      <Sequence from={590} durationInFrames={20}>
        <FadeTransition />
      </Sequence>

      {/* Scene 5: Profile  600–750 */}
      <Sequence from={600} durationInFrames={160}>
        <SceneProfile />
      </Sequence>

      <Sequence from={740} durationInFrames={20}>
        <FadeTransition />
      </Sequence>

      {/* Scene 6: Outro  750–870 */}
      <Sequence from={750} durationInFrames={120}>
        <SceneOutro />
      </Sequence>
    </AbsoluteFill>
  )
}
