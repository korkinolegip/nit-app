import { useState, useEffect } from 'react'
import Loader from './components/Loader'
import Welcome from './screens/Welcome'
import Chat from './screens/Chat'
import MatchChat from './screens/MatchChat'
import Discovery from './screens/Discovery'
import Profile from './screens/Profile'
import Matches from './screens/Matches'
import ProfileViews from './screens/ProfileViews'
import { initAuth } from './api/client'
import { getChatStatus } from './api/chat'
import { getMatches } from './api/matches'
import { getViewsCount } from './api/views'

type Screen = 'welcome' | 'chat' | 'matchChat' | 'discovery' | 'matches' | 'chats' | 'views' | 'profile'

interface Badges {
  matches: number
  chats: number
  views: number
}

export default function App() {
  const [screen, setScreen] = useState<Screen | null>(null)
  const [matchId, setMatchId] = useState<number | null>(null)
  const [isReturning, setIsReturning] = useState(false)
  const [sessionComplete, setSessionComplete] = useState(false)
  const [hasPhotos, setHasPhotos] = useState(false)
  const [badges, setBadges] = useState<Badges>({ matches: 0, chats: 0, views: 0 })

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (tg) {
      tg.expand()
      tg.ready()
    }

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

  // Fetch badge counts when app is active
  useEffect(() => {
    if (!screen || screen === 'welcome') return

    const fetchBadges = async () => {
      try {
        const [matchesData, viewsData] = await Promise.all([
          getMatches(0),
          getViewsCount(),
        ])
        const pending = matchesData.matches.filter(m => m.user_action === null).length
        const unreadChats = matchesData.matches.filter(m => m.user_action === 'like' && m.has_unread).length
        setBadges({ matches: pending, chats: unreadChats, views: viewsData.count })
      } catch {
        // ignore
      }
    }

    fetchBadges()
    const interval = setInterval(fetchBadges, 30_000)
    return () => clearInterval(interval)
  }, [screen])

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
          badges={badges}
        />
      </div>

      {screen === 'matchChat' && matchId !== null && (
        <MatchChat matchId={matchId} onBack={backToChat} />
      )}
      {screen === 'discovery' && <Discovery onBack={backToChat} onOpenChat={openMatchChat} />}
      {screen === 'profile' && <Profile onBack={backToChat} />}
      {screen === 'matches' && <Matches onBack={backToChat} onOpenChat={openMatchChat} />}
      {screen === 'chats' && <Matches onBack={backToChat} onOpenChat={openMatchChat} chatsOnly />}
      {screen === 'views' && <ProfileViews onBack={backToChat} onOpenMatch={openMatchChat} />}
    </>
  )
}
