import { forwardRef } from 'react'

const THREAD_CONFIGS = [
  { left: '46.5%', height: '48%', opacity: 0.9, animation: 'sw1 3.8s ease-in-out infinite' },
  { left: '49.5%', height: '38%', opacity: 0.6, animation: 'sw2 4.4s ease-in-out infinite 0.5s' },
  { left: '52%', height: '54%', opacity: 0.38, animation: 'sw1 5.1s ease-in-out infinite 1s' },
  { left: '44%', height: '30%', opacity: 0.25, animation: 'sw2 3.5s ease-in-out infinite 1.6s' },
  { left: '55%', height: '42%', opacity: 0.2, animation: 'sw1 4.7s ease-in-out infinite 2.2s' },
  { left: '48%', height: '22%', opacity: 0.15, animation: 'sw2 6s ease-in-out infinite 0.8s' },
]

interface ThreadProps {
  index: number
}

const Thread = forwardRef<HTMLDivElement, ThreadProps>(({ index }, ref) => {
  const config = THREAD_CONFIGS[index]
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 0,
        left: config.left,
        height: config.height,
        opacity: config.opacity,
        width: '1px',
        background: `linear-gradient(
          to bottom,
          transparent 0%,
          rgba(255,255,255,0.55) 18%,
          rgba(255,255,255,0.25) 60%,
          rgba(255,255,255,0.06) 85%,
          transparent 100%
        )`,
        transformOrigin: 'top center',
        willChange: 'transform',
        animation: config.animation,
      }}
    />
  )
})

Thread.displayName = 'Thread'
export default Thread
