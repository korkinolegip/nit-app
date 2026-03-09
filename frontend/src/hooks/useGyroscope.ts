import { useEffect, useRef, useCallback } from 'react'

const SENSITIVITY = [1.4, 1.0, 1.7, 0.8, 1.2, 0.6]
const MAX_ANGLE = 9

export function useGyroscope(threadRefs: React.RefObject<(HTMLDivElement | null)[]>) {
  const tiltRef = useRef(0)
  const activeRef = useRef(false)

  const applyTilt = useCallback((tilt: number) => {
    const threads = threadRefs.current
    if (!threads) return

    threads.forEach((el, i) => {
      if (!el) return
      const angle = tilt * MAX_ANGLE * SENSITIVITY[i]
      el.style.transform = `rotate(${angle}deg)`
      el.style.animationPlayState = Math.abs(tilt) > 0.05 ? 'paused' : 'running'
    })
  }, [threadRefs])

  useEffect(() => {
    // Gyroscope
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const tilt = Math.max(-1, Math.min(1, (e.gamma || 0) / 35))
      tiltRef.current = tilt
      applyTilt(tilt)
    }

    if (window.DeviceOrientationEvent) {
      const setup = () => {
        window.addEventListener('deviceorientation', handleOrientation)
      }

      if (typeof (DeviceOrientationEvent as any).requestPermission === 'function') {
        // iOS — will be triggered on first tap
        const requestPermission = () => {
          ;(DeviceOrientationEvent as any)
            .requestPermission()
            .then((r: string) => { if (r === 'granted') setup() })
            .catch(() => {})
        }
        document.addEventListener('pointerdown', requestPermission, { once: true })
      } else {
        setup()
      }
    }

    // Mouse fallback
    const handleMouseMove = (e: MouseEvent) => {
      activeRef.current = true
      const cx = window.innerWidth / 2
      const tilt = (e.clientX - cx) / cx
      tiltRef.current = tilt
      applyTilt(tilt)
    }

    const handleMouseLeave = () => {
      activeRef.current = false
      tiltRef.current = 0
      const threads = threadRefs.current
      if (threads) {
        threads.forEach(el => {
          if (el) {
            el.style.transform = ''
            el.style.animationPlayState = 'running'
          }
        })
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseleave', handleMouseLeave)

    // Return to center
    const interval = setInterval(() => {
      if (!activeRef.current && Math.abs(tiltRef.current) > 0.01) {
        tiltRef.current *= 0.9
        applyTilt(tiltRef.current)
      }
    }, 16)

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseleave', handleMouseLeave)
      clearInterval(interval)
    }
  }, [applyTilt, threadRefs])
}
