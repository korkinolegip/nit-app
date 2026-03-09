import { useState, useRef, useCallback } from 'react'
import { sendMessage, ChatResponse } from '../api/chat'

export interface Message {
  id: number
  sender: 'ai' | 'me'
  text: string
  type: 'text' | 'voice' | 'portrait_card' | 'match_card' | 'quick_replies'
  cardData?: Record<string, any>
  voiceDuration?: string
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [quickReplies, setQuickReplies] = useState<string[]>([])
  const nextIdRef = useRef(1)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
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
      } else {
        addMessage({ sender: 'ai', text: res.reply, type: 'text' })
      }

      if (res.quick_replies) {
        setQuickReplies(res.quick_replies)
      }
    } catch {
      setIsTyping(false)
      addMessage({
        sender: 'ai',
        text: 'Произошла ошибка. Попробуй ещё раз.',
        type: 'text',
      })
    }
  }, [addMessage])

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
