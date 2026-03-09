import { useState, useRef, useCallback } from 'react'

interface VoiceRecordResult {
  isRecording: boolean
  seconds: number
  start: () => void
  stop: () => Promise<Blob | null>
  cancel: () => void
}

export function useVoiceRecord(): VoiceRecordResult {
  const [isRecording, setIsRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<number | null>(null)

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      setSeconds(0)

      timerRef.current = window.setInterval(() => {
        setSeconds(s => s + 1)
      }, 1000)
    } catch {
      console.error('Microphone access denied')
    }
  }, [])

  const stop = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        recorder.stream.getTracks().forEach(t => t.stop())
        resolve(blob)
      }

      recorder.stop()
      setIsRecording(false)
      if (timerRef.current) clearInterval(timerRef.current)
    })
  }, [])

  const cancel = useCallback(() => {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
      recorder.stream.getTracks().forEach(t => t.stop())
    }
    setIsRecording(false)
    setSeconds(0)
    chunksRef.current = []
    if (timerRef.current) clearInterval(timerRef.current)
  }, [])

  return { isRecording, seconds, start, stop, cancel }
}
