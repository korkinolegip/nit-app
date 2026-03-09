import { useState, useEffect } from 'react'
import Welcome from './screens/Welcome'
import Chat from './screens/Chat'
import MatchChat from './screens/MatchChat'
import { initAuth } from './api/client'

type Screen = 'welcome' | 'chat' | 'matchChat'

export default function App() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [matchId, setMatchId] = useState<number | null>(null)
  const [authReady, setAuthReady] = useState(false)

  useEffect(() => {
    initAuth()
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(true)) // proceed even if auth fails in dev
  }, [])

  const openChat = () => setScreen('chat')
  const openMatchChat = (id: number) => {
    setMatchId(id)
    setScreen('matchChat')
  }
  const backToChat = () => setScreen('chat')

  if (screen === 'welcome') {
    return <Welcome onStart={openChat} />
  }

  if (screen === 'matchChat' && matchId !== null) {
    return <MatchChat matchId={matchId} onBack={backToChat} />
  }

  return <Chat onOpenMatch={openMatchChat} />
}
