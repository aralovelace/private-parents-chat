'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useChannel, usePresence, usePresenceListener } from 'ably/react'
import { formatDistanceToNow } from 'date-fns'
import type { ChatMessage } from '../../lib/types'
import { useAblyClient } from './AblyProvider'
import { AiTransportPanel } from './AiTransport'

interface Props {
  member: { name: string; token: string }
  onLogout?: () => void
}

export function ChatRoom({ member, onLogout }: Props) {
  const [messages, setMessages]     = useState<ChatMessage[]>([])
  const [input, setInput]           = useState('')
  const [isTyping, setIsTyping]     = useState<string | null>(null)
  const [showAi, setShowAi]         = useState(false)
  const messagesEndRef               = useRef<HTMLDivElement>(null)
  const typingTimeoutRef             = useRef<ReturnType<typeof setTimeout> | null>(null)
  const channel                      = process.env.NEXT_PUBLIC_CHAT_CHANNEL || 'community:members-only'
  const communityName                = process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'Members Chat'

  // Get the raw Ably client for AI Transport
  const ablyClient = useAblyClient()

  // ── Ably: subscribe to messages ─────────────────────────────────────────
  const { publish } = useChannel(channel, (message) => {
    if (message.name === 'chat') {
      setMessages(prev => {
        if (prev.some(m => m.id === message.data.id)) return prev
        return [...prev, message.data as ChatMessage].sort((a, b) => a.timestamp - b.timestamp)
      })
    }
    if (message.name === 'typing') {
      const { author, active } = message.data
      if (author !== member.name) {
        setIsTyping(active ? author : null)
        if (active) {
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
          typingTimeoutRef.current = setTimeout(() => setIsTyping(null), 3000)
        }
      }
    }
  })

  // ── Ably: presence ───────────────────────────────────────────────────────
  // Enter presence set with initial status
  usePresence(channel, { status: 'active' })
  // Listen to presence updates to get list of online members
  const { presenceData } = usePresenceListener(channel)
  const onlineCount = presenceData.length

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function sendMessage() {
    const text = input.trim()
    if (!text) return
    const msg: ChatMessage = {
      id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author:    member.name,
      text,
      timestamp: Date.now(),
    }
    publish('chat', msg)
    publish('typing', { author: member.name, active: false })
    setInput('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function handleInputChange(value: string) {
    setInput(value)
    publish('typing', { author: member.name, active: value.length > 0 })
  }

  /** Post an AI response into the group chat channel */
  function postAiResponseToChat(text: string) {
    const msg: ChatMessage = {
      id:        `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      author:    `${communityName} AI`,
      text,
      timestamp: Date.now(),
      isAI:      true,
    }
    publish('chat', msg)
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-ink-200/50 bg-white/60 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="font-display text-xl text-ink-900">{communityName}</h1>
          <p className="text-xs text-ink-400 mt-0.5">Private members channel</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Logout button */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="text-xs text-ink-500 hover:text-ember px-3 py-1.5 rounded-full
                         border border-ink-200 hover:border-ember/40 transition-all"
              title="Logout"
            >
              Logout
            </button>
          )}

          {/* AI Transport toggle */}
          <button
            onClick={() => setShowAi(!showAi)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full
                        border transition-all ${showAi
              ? 'bg-amber-100 border-gold/60 text-amber-700'
              : 'bg-white border-ink-200 text-ink-500 hover:border-gold/40 hover:text-amber-600'
            }`}
          >
            <span>✨</span>
            AI Assistant
          </button>

          {/* Online count */}
          <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" style={{ boxShadow: '0 0 0 2px rgba(52,211,153,0.2)' }} />
            <span className="text-xs text-emerald-700 font-semibold">{onlineCount} online</span>
          </div>

          {/* Member avatars */}
          <div className="flex -space-x-2">
            {presenceData.slice(0, 4).map((p) => (
              <div
                key={p.clientId}
                title={p.clientId}
                className="w-8 h-8 rounded-full bg-ink-700 border-2 border-parchment
                           flex items-center justify-center text-xs font-bold text-parchment"
              >
                {p.clientId.slice(0, 1).toUpperCase()}
              </div>
            ))}
            {onlineCount > 4 && (
              <div className="w-8 h-8 rounded-full bg-ink-200 border-2 border-parchment
                              flex items-center justify-center text-xs font-semibold text-ink-600">
                +{onlineCount - 4}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body: Chat + AI sidebar ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Main chat area */}
        <div className={`flex flex-col flex-1 transition-all duration-300 ${showAi ? 'max-w-[calc(100%-320px)]' : 'w-full'}`}>

          {/* Messages */}
          <main className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16 animate-fade-in">
                <div className="text-4xl mb-3">🏠</div>
                <p className="font-display text-xl text-ink-700 mb-1">Welcome to the family</p>
                <p className="text-ink-400 text-sm">Be the first to say something</p>
              </div>
            )}

            {messages.map((msg, i) => {
              const isOwn       = msg.author === member.name
              const showAuthor  = i === 0 || messages[i - 1].author !== msg.author

              return (
                <div
                  key={msg.id}
                  className={`flex gap-3 animate-slide-up ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {!isOwn && (
                    <div className="w-8 h-8 rounded-full bg-ink-700 flex-shrink-0 flex items-center justify-center text-xs font-bold text-parchment mt-1">
                      {msg.isAI ? '✨' : msg.author.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className={`max-w-[72%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {showAuthor && !isOwn && (
                      <span className="text-xs font-semibold text-ink-500 px-1">{msg.author}</span>
                    )}

                    <div className={msg.isAI ? 'message-ai' : isOwn ? 'message-own' : 'message-other'}>
                      {msg.isAI && (
                        <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-amber-700">
                          <span>✨</span> Community AI · via Ably AI Transport
                        </div>
                      )}
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    </div>

                    <span className={`text-[10px] text-ink-400 px-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                      {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Typing indicator */}
            {isTyping && (
              <div className="flex items-center gap-2 text-sm text-ink-400 animate-fade-in">
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-pulse-soft" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-pulse-soft" style={{ animationDelay: '200ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-400 rounded-full animate-pulse-soft" style={{ animationDelay: '400ms' }} />
                </div>
                <span className="italic">{isTyping} is typing</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </main>

          {/* Input */}
          <footer className="px-6 py-4 border-t border-ink-200/50 bg-white/60 backdrop-blur-sm">
            <div className="flex gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write something to the community…"
                  rows={1}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-ink-200 bg-parchment
                             text-ink-800 placeholder-ink-300 text-sm font-sans resize-none
                             focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold
                             transition-all max-h-32 overflow-y-auto"
                  style={{ minHeight: '48px' }}
                />
              </div>

              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="w-12 h-12 rounded-xl bg-ink-800 hover:bg-ember disabled:bg-ink-300
                           flex items-center justify-center transition-all duration-200 flex-shrink-0"
              >
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>

            <p className="text-[10px] text-ink-400 mt-2 text-center">
              <kbd className="font-mono bg-ink-100 px-1 rounded">Enter</kbd> to send ·{' '}
              <kbd className="font-mono bg-ink-100 px-1 rounded">Shift+Enter</kbd> for new line ·{' '}
              Use <strong>✨ AI Assistant</strong> for help
            </p>
          </footer>
        </div>

        {/* ── AI Transport sidebar ──────────────────────────────────── */}
        <div className={`transition-all duration-300 overflow-hidden flex-shrink-0 ${
          showAi ? 'w-80' : 'w-0'
        }`}>
          {showAi && (
            <AiTransportPanel
              ablyClient={ablyClient}
              memberToken={member.token}
              memberName={member.name}
              communityName={communityName}
              onPostToChat={postAiResponseToChat}
            />
          )}
        </div>
      </div>
    </div>
  )
}
