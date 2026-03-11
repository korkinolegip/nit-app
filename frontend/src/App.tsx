import { useState, useEffect } from 'react'
import Loader from './components/Loader'
import BottomNav from './components/BottomNav'
import SettingsSheet from './components/SettingsSheet'
import Welcome from './screens/Welcome'
import Chat from './screens/Chat'
import MatchChat from './screens/MatchChat'
import Discovery from './screens/Discovery'
import Profile from './screens/Profile'
import Matches from './screens/Matches'
import ProfileViews from './screens/ProfileViews'
import Feed from './screens/Feed'
import SavedProfiles from './screens/SavedProfiles'
import Admin from './screens/Admin'
import { initAuth } from './api/client'
import { apiRequest } from './api/client'
import { getChatStatus } from './api/chat'
import { getMatches } from './api/matches'
import { getViewsCount } from './api/views'
import { getProfile } from './api/profile'

type Screen = 'welcome' | 'feed' | 'matchChat' | 'discovery' | 'matches' | 'chats' | 'views' | 'profile' | 'saved' | 'admin'
type MainTab = 'feed' | 'discovery' | 'matches' | 'profile'

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
  const [isAdmin, setIsAdmin] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp
    if (tg) {
      tg.expand()
      tg.ready()
    }

    fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/health`).catch(() => {})

    initAuth()
      .then(() => Promise.all([getChatStatus(), getProfile().catch(() => null)]))
      .then(([status, profile]) => {
        if ((profile as any)?.user?.is_admin) setIsAdmin(true)
        if ((profile as any)?.user?.is_paused) setIsPaused(true)
        if (status.has_session) {
          setIsReturning(true)
          setSessionComplete(status.profile_ready)
          setHasPhotos(status.has_photos ?? false)
          const onboardingDone = (profile as any)?.user?.onboarding_complete ?? false
          const hasPendingMatch = (profile as any)?.user?.has_pending_match_target ?? false
          setScreen('feed')
          setChatOpen(!onboardingDone || hasPendingMatch)
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
        const pending = matchesData.matches.filter((m: any) => m.user_action === null).length
        const unreadChats = matchesData.matches.filter((m: any) => m.user_action === 'like' && m.has_unread).length
        setBadges({ matches: pending, chats: unreadChats, views: viewsData.count })
      } catch {
        // ignore
      }
    }

    fetchBadges()
    const interval = setInterval(fetchBadges, 30_000)
    return () => clearInterval(interval)
  }, [screen])

  const openChat = () => setChatOpen(true)
  const closeChat = () => setChatOpen(false)

  const openMatchChat = (id: number) => {
    setMatchId(id)
    setScreen('matchChat')
  }

  // Called by Chat component when agent navigates to a screen
  const handleNavigateTo = (navScreen: string) => {
    setChatOpen(false)
    setScreen(navScreen as Screen)
  }

  // Called by BottomNav tab changes
  const handleTabChange = (tab: 'feed' | 'discovery' | 'chat' | 'matches' | 'profile') => {
    if (tab === 'chat') {
      setChatOpen(true)
    } else {
      setScreen(tab as Screen)
    }
  }

  const handleTogglePause = async () => {
    try {
      if (isPaused) {
        await apiRequest('/api/profile/unpause', { method: 'POST' })
        setIsPaused(false)
      } else {
        await apiRequest('/api/profile/pause', { method: 'POST' })
        setIsPaused(true)
      }
    } catch {
      // ignore
    }
  }

  // Compute which BottomNav tab is active based on current screen
  const activeTab: MainTab =
    screen === 'feed' ? 'feed' :
    screen === 'discovery' ? 'discovery' :
    (screen === 'matches' || screen === 'chats' || screen === 'matchChat') ? 'matches' :
    'profile'

  // BottomNav hidden during chat overlay or MatchChat (has its own input bar)
  const bottomNavHidden = chatOpen || screen === 'matchChat'
  // Nav height offset for content padding
  const navPaddingBottom = bottomNavHidden ? '0px' : 'calc(56px + env(safe-area-inset-bottom, 0px))'

  if (screen === null) {
    return <Loader fullScreen />
  }

  if (screen === 'welcome') {
    return (
      <Welcome onStart={() => {
        setScreen('feed')
        setChatOpen(true)
      }} />
    )
  }

  return (
    <>
      {/* Main content area — padded so content isn't hidden behind BottomNav */}
      <div style={{ paddingBottom: navPaddingBottom, minHeight: '100dvh', boxSizing: 'border-box' }}>
        {screen === 'feed' && (
          <Feed onBack={openChat} />
        )}
        {screen === 'discovery' && (
          <Discovery onBack={openChat} onOpenChat={openMatchChat} onGoToChat={openChat} />
        )}
        {screen === 'matches' && (
          <Matches onBack={openChat} onOpenChat={openMatchChat} />
        )}
        {screen === 'chats' && (
          <Matches onBack={openChat} onOpenChat={openMatchChat} chatsOnly />
        )}
        {screen === 'matchChat' && matchId !== null && (
          <MatchChat matchId={matchId} onBack={() => setScreen('matches')} />
        )}
        {screen === 'views' && (
          <ProfileViews onBack={() => setScreen('profile')} onOpenMatch={openMatchChat} />
        )}
        {screen === 'profile' && (
          <Profile onBack={openChat} onGoToChat={openChat} />
        )}
        {screen === 'saved' && (
          <SavedProfiles onBack={() => setScreen('profile')} onGoToChat={openChat} onOpenChat={openMatchChat} />
        )}
        {screen === 'admin' && (
          <Admin onBack={() => setScreen('profile')} />
        )}
      </div>

      {/* Chat overlay — always mounted, slides up/down */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 50,
        transform: chatOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        pointerEvents: chatOpen ? 'auto' : 'none',
      }}>
        <Chat
          onClose={closeChat}
          onOpenMatch={openMatchChat}
          onNavigateTo={handleNavigateTo}
          isReturning={isReturning}
          sessionComplete={sessionComplete}
          hasPhotos={hasPhotos}
          badges={badges}
          isAdmin={isAdmin}
          isVisible={chatOpen}
        />
      </div>

      {/* Bottom navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        badges={{ matches: badges.matches + badges.chats, views: badges.views }}
        isAdmin={isAdmin}
        hidden={bottomNavHidden}
        onNavigateTo={(s) => setScreen(s as Screen)}
        onOpenSettings={() => setSettingsOpen(true)}
        isPaused={isPaused}
        onTogglePause={handleTogglePause}
      />

      {/* Settings sheet (accessible from BottomNav context menu) */}
      {settingsOpen && (
        <SettingsSheet onClose={() => setSettingsOpen(false)} />
      )}
    </>
  )
}
