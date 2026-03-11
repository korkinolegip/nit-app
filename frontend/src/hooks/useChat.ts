import { useState, useRef, useCallback } from 'react'
import { sendMessage, ChatResponse } from '../api/chat'

export interface Message {
  id: number
  sender: 'ai' | 'me'
  text: string
  type: 'text' | 'voice' | 'portrait_card' | 'match_card' | 'photo_prompt' | 'user_cards' | 'activity_summary' | 'action_buttons' | 'greeting'
  cardData?: Record<string, any>
  voiceDuration?: string
  actionButtons?: { label: string; screen: string }[]
  greetingData?: {
    tiles?: { icon: string; label: string; screen: string; count: number }[]
    menu_buttons?: { icon: string; label: string; screen: string }[]
  }
}

type NavScreen = 'discovery' | 'matches' | 'chats' | 'views' | 'profile'

const NAV_LABELS: Record<NavScreen, string> = {
  discovery: 'Люди',
  matches: 'Матчи',
  chats: 'Чаты',
  views: 'Просмотры',
  profile: 'Профиль',
}

export function useChat(opts?: { onNavigate?: (screen: NavScreen) => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const nextIdRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, 100)
  }, [])

  const addMessage = useCallback((msg: Omit<Message, 'id'>) => {
    const id = nextIdRef.current++
    setMessages(prev => [...prev, { ...msg, id }])
    scrollToBottom()
    return id
  }, [scrollToBottom])

  // Attempt navigation with retries; on full failure show a nav button in chat
  const navigateTo = useCallback((screen: NavScreen, reply: string) => {
    addMessage({ sender: 'ai', text: reply, type: 'text' })

    if (!opts?.onNavigate) {
      // No navigator provided — show fallback button
      addMessage({
        sender: 'ai',
        text: `Нажми чтобы перейти:`,
        type: 'greeting',
        greetingData: {
          menu_buttons: [{ icon: '→', label: NAV_LABELS[screen], screen }],
        },
      })
      return
    }

    let attempts = 0
    const tryNavigate = () => {
      attempts++
      try {
        opts.onNavigate!(screen)
      } catch (err) {
        console.warn(`[useChat] Navigation to ${screen} failed (attempt ${attempts}):`, err)
        if (attempts < 3) {
          setTimeout(tryNavigate, 500)
        } else {
          // All retries exhausted — show button fallback
          addMessage({
            sender: 'ai',
            text: 'Не удалось перейти автоматически. Нажми кнопку:',
            type: 'greeting',
            greetingData: {
              menu_buttons: [{ icon: '→', label: NAV_LABELS[screen], screen }],
            },
          })
        }
      }
    }

    setTimeout(tryNavigate, 700)
  }, [addMessage, opts])

  const send = useCallback(async (text: string) => {
    addMessage({ sender: 'me', text, type: 'text' })
    setQuickReplies([])
    setIsTyping(true)

    try {
      const res: ChatResponse = await sendMessage(text)

      setIsTyping(false)

      const rt = res.reply_type

      if (rt === 'portrait_card' && res.card_data) {
        addMessage({ sender: 'ai', text: res.reply, type: 'portrait_card', cardData: res.card_data })
      } else if (rt === 'photo_prompt') {
        addMessage({ sender: 'ai', text: res.reply, type: 'photo_prompt' })
      } else if (rt === 'user_cards' && res.card_data) {
        addMessage({ sender: 'ai', text: res.reply, type: 'user_cards', cardData: res.card_data })
      } else if (rt === 'navigate_matches' || rt === 'go_to_matches') {
        navigateTo('matches', res.reply)
      } else if (rt === 'navigate_discovery' || rt === 'go_to_discovery') {
        navigateTo('discovery', res.reply)
      } else if (rt === 'navigate_profile' || rt === 'go_to_profile') {
        navigateTo('profile', res.reply)
      } else if (rt === 'navigate_chats' || rt === 'go_to_chats') {
        navigateTo('chats', res.reply)
      } else if (rt === 'navigate_views' || rt === 'go_to_views') {
        navigateTo('views', res.reply)
      } else if (res.menu_buttons && res.menu_buttons.length > 0) {
        addMessage({
          sender: 'ai',
          text: res.reply,
          type: 'greeting',
          greetingData: { menu_buttons: res.menu_buttons },
        })
      } else {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
        if (res.quick_replies && res.quick_replies.length > 0) {
          setQuickReplies(res.quick_replies)
        }
      }
    } catch {
      setIsTyping(false)
      addMessage({ sender: 'ai', text: 'Произошла ошибка. Попробуй ещё раз.', type: 'text' })
    }
  }, [addMessage, navigateTo])

  return {
    messages,
    isTyping,
    quickReplies,
    send,
    addMessage,
    scrollRef,
    setQuickReplies,
  }
}
