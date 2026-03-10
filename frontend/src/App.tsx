import { useState, useEffect } from 'react'
import Welcome from './screens/Welcome'
import Chat from './screens/Chat'
import MatchChat from './screens/MatchChat'
import Discovery from './screens/Discovery'
import Profile from './screens/Profile'
import Matches from './screens/Matches'
import { initAuth } from './api/client'
import { getChatStatus } from './api/chat'

type Screen = 'welcome' | 'chat' | 'matchChat' | 'discovery' | 'matches' | 'profile'

export default function App() {
  const [screen, setScreen] = useState<Screen | null>(null)
  const [matchId, setMatchId] = useState<number | null>(null)
  const [isReturning, setIsReturning] = useState(false)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [hasPhotos, setHasPhotos] = useState(false)

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (tg) {
      tg.expand()
      tg.ready()
    }

    initAuth()
      .then(() => getChatStatus())
      .then((status) => {
        if (status.has_session) {
          setIsReturning(true)
          setSessionComplete(status.profile_ready)
          setHasPhotos(status.has_photos ?? false)
          setScreen('chat')
        } else {
          setScreen('welcome')
        }
      })
      .catch(() => {
        setScreen('welcome')
      })
  }, [])

  const openChat = () => setScreen('chat')
  const openMatchChat = (id: number) => {
    setMatchId(id)
    setScreen('matchChat')
  }
  const backToChat = () => setScreen('chat')

  if (screen === null) {
    return (
      <div style={{
        height: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)',
      }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--d3)' }} />
      </div>
    )
  }

  if (screen === 'welcome') {
    return <Welcome onStart={openChat} />
  }

  if (screen === 'matchChat' && matchId !== null) {
    return <MatchChat matchId={matchId} onBack={backToChat} />
  }

  if (screen === 'discovery') {
    return <Discovery onBack={backToChat} />
  }

  if (screen === 'profile') {
    return <Profile onBack={backToChat} />
  }

  if (screen === 'matches') {
    return <Matches onBack={backToChat} onOpenChat={openMatchChat} />
  }

  return <Chat
    onOpenMatch={openMatchChat}
    onNavigateTo={setScreen}
    isReturning={isReturning}
    sessionComplete={sessionComplete}
    hasPhotos={hasPhotos}
  />
}
