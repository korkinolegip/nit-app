import { useState, useEffect } from 'react'
import Loader from './components/Loader'
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

    // Silent warmup ping to prevent cold-start issues on Render
    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/health`).catch(() => {})

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
    return <Loader fullScreen />
  }

  if (screen === 'welcome') {
    return <Welcome onStart={openChat} />
  }

  // Keep Chat always mounted to preserve message history.
  // Other screens render on top as overlays.
  return (
    <>
      <div style={{
        display: screen === 'chat' ? 'flex' : 'none',
        flexDirection: 'column', height: '100dvh', position: 'relative',
      }}>
        <Chat
          onOpenMatch={openMatchChat}
          onNavigateTo={setScreen}
          isReturning={isReturning}
          sessionComplete={sessionComplete}
          hasPhotos={hasPhotos}
        />
      </div>

      {screen === 'matchChat' && matchId !== null && (
        <MatchChat matchId={matchId} onBack={backToChat} />
      )}
      {screen === 'discovery' && <Discovery onBack={backToChat} onOpenChat={openMatchChat} />}
      {screen === 'profile' && <Profile onBack={backToChat} />}
      {screen === 'matches' && <Matches onBack={backToChat} onOpenChat={openMatchChat} />}
    </>
  )
}
