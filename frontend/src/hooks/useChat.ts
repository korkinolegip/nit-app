import { useState, useRef, useCallback } from 'react'
import { sendMessage, ChatResponse } from '../api/chat'

export interface Message {
  id: number
  sender: 'ai' | 'me'
  text: string
  type: 'text' | 'voice' | 'portrait_card' | 'match_card' | 'photo_prompt' | 'user_cards' | 'activity_summary' | 'action_buttons'
  cardData?: Record<string, any>
  voiceDuration?: string
  actionButtons?: { label: string; screen: string }[]
}

export function useChat(opts?: { onNavigate?: (screen: 'discovery' | 'matches' | 'chats' | 'views' | 'profile') => void }) {
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

  const send = useCallback(async (text: string) => {
    addMessage({ sender: 'me', text, type: 'text' })
    setQuickReplies([])
    setIsTyping(true)

    try {
      const res: ChatResponse = await sendMessage(text)

      setIsTyping(false)

      if (res.reply_type === 'portrait_card' && res.card_data) {
        addMessage({
          sender: 'ai',
          text: res.reply,
          type: 'portrait_card',
          cardData: res.card_data,
        })
      } else if (res.reply_type === 'photo_prompt') {
        addMessage({ sender: 'ai', text: res.reply, type: 'photo_prompt' })
      } else if (res.reply_type === 'user_cards' && res.card_data) {
        addMessage({ sender: 'ai', text: res.reply, type: 'user_cards', cardData: res.card_data })
      } else if (res.reply_type === 'navigate_matches') {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
        setTimeout(() => opts?.onNavigate?.('matches'), 700)
      } else if (res.reply_type === 'navigate_discovery') {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
        setTimeout(() => opts?.onNavigate?.('discovery'), 700)
      } else if (res.reply_type === 'navigate_profile') {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
        setTimeout(() => opts?.onNavigate?.('profile'), 700)
      } else if (res.reply_type === 'go_to_chats' || res.reply_type === 'navigate_chats') {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
        setTimeout(() => opts?.onNavigate?.('chats'), 700)
      } else if (res.reply_type === 'go_to_views' || res.reply_type === 'navigate_views') {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
        setTimeout(() => opts?.onNavigate?.('views'), 700)
      } else {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
        if (res.quick_replies && res.quick_replies.length > 0) {
          setQuickReplies(res.quick_replies)
        }
      }
    } catch {
      setIsTyping(false)
      addMessage({
        sender: 'ai',
        text: 'Произошла ошибка. Попробуй ещё раз.',
        type: 'text',
      })
    }
  }, [addMessage, opts])

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
