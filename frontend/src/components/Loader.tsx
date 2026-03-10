export default function Loader({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center',
      height: fullScreen ? '100dvh' : '100%',
      minHeight: fullScreen ? undefined : 200,
      background: fullScreen ? 'var(--bg)' : undefined,
    }}>
      {/* Thread + orb container */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        {/* Threads */}
        {[
          { left: '42%', height: '85%', opacity: 0.75, anim: 'lsw1 3.8s ease-in-out infinite' },
          { left: '50%', height: '70%', opacity: 0.45, anim: 'lsw2 4.4s ease-in-out infinite 0.5s' },
          { left: '58%', height: '92%', opacity: 0.28, anim: 'lsw1 5.1s ease-in-out infinite 1s' },
          { left: '35%', height: '55%', opacity: 0.18, anim: 'lsw2 6s ease-in-out infinite 1.6s' },
        ].map((t, i) => (
          <div key={i} style={{
            position: 'absolute', top: 0, left: t.left,
            width: 1, height: t.height, opacity: t.opacity,
            background: 'linear-gradient(to bottom, transparent 0%, rgba(255,255,255,.55) 20%, rgba(255,255,255,.18) 70%, transparent 100%)',
            transformOrigin: 'top center',
            animation: t.anim,
          }} />
        ))}
        {/* Orb */}
        <div style={{
          position: 'absolute', inset: '10%', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,.12) 0%, rgba(255,255,255,.03) 55%, transparent 75%)',
          animation: 'lorb 2.8s ease-in-out infinite',
        }} />
      </div>

      {/* Label */}
      <div style={{
        marginTop: 18, fontSize: 10, fontWeight: 500,
        letterSpacing: '.32em', color: 'var(--d4)',
        fontFamily: 'Inter, sans-serif',
      }}>
        Н И Т Ь
      </div>

      <style>{`
        @keyframes lorb {
          0%, 100% { opacity: .8; transform: scale(1); }
          50% { opacity: .3; transform: scale(1.2); }
        }
        @keyframes lsw1 { 0%, 100% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } }
        @keyframes lsw2 { 0%, 100% { transform: rotate(1deg); } 50% { transform: rotate(-1deg); } }
      `}</style>
    </div>
  )
}
