'use client'

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { useChannel, usePresence, usePresenceListener } from 'ably/react'
import { formatDistanceToNow } from 'date-fns'
import type { ChatMessage } from '../../lib/types'
import { useAblyClient } from './AblyProvider'
import { AiTransportPanel } from './AiTransport'
import {
  ArrowRightOnRectangleIcon,
  SparklesIcon,
  UserGroupIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  HomeIcon,
  HeartIcon as HeartIconOutline
} from '@heroicons/react/24/outline'
import { CheckCircleIcon, HeartIcon as HeartIconSolid } from '@heroicons/react/24/solid'

interface Props {
  member: { name: string; token: string }
  onLogout?: () => void
}

export function ChatRoom({ member, onLogout }: Props) {
  const [messages, setMessages]     = useState<ChatMessage[]>([])
  const [input, setInput]           = useState('')
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const [showAi, setShowAi]         = useState(false)
  const messagesEndRef               = useRef<HTMLDivElement>(null)
  const typingTimeoutRef             = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const inputTypingTimeoutRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
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
        setTypingUsers(prev => {
          const updated = new Set(prev)
          if (active) {
            updated.add(author)
            // Clear existing timeout for this user
            if (typingTimeoutRef.current[author]) {
              clearTimeout(typingTimeoutRef.current[author])
            }
            // Auto-clear after 3 seconds of inactivity
            typingTimeoutRef.current[author] = setTimeout(() => {
              setTypingUsers(current => {
                const cleared = new Set(current)
                cleared.delete(author)
                return cleared
              })
              delete typingTimeoutRef.current[author]
            }, 3000)
          } else {
            updated.delete(author)
            if (typingTimeoutRef.current[author]) {
              clearTimeout(typingTimeoutRef.current[author])
              delete typingTimeoutRef.current[author]
            }
          }
          return updated
        })
      }
    }
    if (message.name === 'like') {
      const { messageId, author, action } = message.data
      setMessages(prev => prev.map(msg => {
        if (msg.id === messageId) {
          const currentLikes = msg.likes || []
          const newLikes = action === 'add'
            ? [...currentLikes, author]
            : currentLikes.filter(name => name !== author)
          return { ...msg, likes: newLikes }
        }
        return msg
      }))
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
  }, [messages, typingUsers])

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      // Clear all typing timeouts
      Object.values(typingTimeoutRef.current).forEach(timeout => clearTimeout(timeout))
      if (inputTypingTimeoutRef.current) {
        clearTimeout(inputTypingTimeoutRef.current)
      }
    }
  }, [])

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

    // Send typing indicator
    if (value.length > 0) {
      publish('typing', { author: member.name, active: true })

      // Clear existing timeout
      if (inputTypingTimeoutRef.current) {
        clearTimeout(inputTypingTimeoutRef.current)
      }

      // Auto-send "stopped typing" after 2 seconds of no input
      inputTypingTimeoutRef.current = setTimeout(() => {
        publish('typing', { author: member.name, active: false })
      }, 2000)
    } else {
      // Input cleared - stop typing
      publish('typing', { author: member.name, active: false })
      if (inputTypingTimeoutRef.current) {
        clearTimeout(inputTypingTimeoutRef.current)
      }
    }
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

  /** Toggle like on a message */
  function toggleLike(messageId: string) {
    const message = messages.find(m => m.id === messageId)
    if (!message) return

    const currentLikes = message.likes || []
    const hasLiked = currentLikes.includes(member.name)
    const action = hasLiked ? 'remove' : 'add'

    publish('like', { messageId, author: member.name, action })
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ───────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-3 sm:px-6 py-3 sm:py-4 border-b border-primary-200 bg-white/80 backdrop-blur-md sticky top-0 z-20 shadow-sm">
        <div className="min-w-0 flex-shrink flex items-center gap-2">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary-400 to-secondary-400 flex items-center justify-center flex-shrink-0">
            <HomeIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
          </div>
          <div>
            <h1 className="font-display text-base sm:text-xl text-neutral-900 truncate">{communityName}</h1>
            <p className="text-[10px] sm:text-xs text-neutral-500 mt-0.5 hidden sm:block">Private members channel</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
          {/* Logout button - desktop only */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="hidden sm:flex items-center gap-1.5 text-xs text-neutral-600 hover:text-warm-600 px-3 py-1.5 rounded-full
                         border border-neutral-200 hover:border-warm-300 transition-all"
              title="Logout"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              Logout
            </button>
          )}

          {/* AI Transport toggle */}
          <button
            onClick={() => setShowAi(!showAi)}
            className={`flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-xs font-semibold px-2 sm:px-3 py-1.5 rounded-full
                        border transition-all min-h-[44px] sm:min-h-0 shadow-sm ${showAi
              ? 'bg-gradient-to-r from-secondary-100 to-primary-100 border-primary-300 text-primary-700'
              : 'bg-white border-neutral-200 text-neutral-600 hover:border-primary-300 hover:text-primary-600'
            }`}
          >
            <SparklesIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="hidden xs:inline">AI</span>
            <span className="hidden sm:inline">Assistant</span>
          </button>

          {/* Online count */}
          <div className="flex items-center gap-1 sm:gap-1.5 bg-accent-50 border border-accent-200 rounded-full px-2 sm:px-3 py-1">
            <CheckCircleIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-accent-500" />
            <span className="text-[10px] sm:text-xs text-accent-700 font-semibold">{onlineCount}</span>
          </div>

          {/* Member avatars - hidden on very small screens */}
          <div className="hidden md:flex -space-x-2">
            {presenceData.slice(0, 4).map((p) => (
              <div
                key={p.clientId}
                title={p.clientId}
                className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 border-2 border-white
                           flex items-center justify-center text-xs font-bold text-white shadow-sm"
              >
                {p.clientId.slice(0, 1).toUpperCase()}
              </div>
            ))}
            {onlineCount > 4 && (
              <div className="w-8 h-8 rounded-full bg-neutral-200 border-2 border-white
                              flex items-center justify-center text-xs font-semibold text-neutral-700 shadow-sm">
                +{onlineCount - 4}
              </div>
            )}
          </div>

          {/* Mobile menu button */}
          {onLogout && (
            <button
              onClick={onLogout}
              className="sm:hidden flex items-center justify-center w-10 h-10 rounded-full
                         border border-neutral-200 hover:border-warm-300 text-neutral-600 hover:text-warm-600 transition-all"
              title="Logout"
              aria-label="Logout"
            >
              <ArrowRightOnRectangleIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* ── Body: Chat + AI sidebar ───────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Main chat area */}
        <div className={`flex flex-col flex-1 transition-all duration-300 ${showAi ? 'lg:max-w-[calc(100%-320px)]' : 'w-full'}`}>

          {/* Messages */}
          <main className="flex-1 overflow-y-auto px-3 sm:px-6 py-4 sm:py-6 space-y-3 sm:space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-16 animate-fade-in">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary-400 to-secondary-400 flex items-center justify-center">
                  <HomeIcon className="w-8 h-8 text-white" />
                </div>
                <p className="font-display text-xl text-neutral-800 mb-1">Welcome to the family</p>
                <p className="text-neutral-500 text-sm">Be the first to say something</p>
              </div>
            )}

            {messages.map((msg, i) => {
              const isOwn       = msg.author === member.name
              const showAuthor  = i === 0 || messages[i - 1].author !== msg.author

              return (
                <div
                  key={msg.id}
                  className={`flex gap-2 sm:gap-3 animate-slide-up ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {!isOwn && (
                    <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1 shadow-sm ${
                      msg.isAI
                        ? 'bg-gradient-to-br from-secondary-400 to-primary-400 text-white'
                        : 'bg-gradient-to-br from-primary-500 to-primary-600 text-white'
                    }`}>
                      {msg.isAI ? <SparklesIcon className="w-4 h-4" /> : msg.author.slice(0, 1).toUpperCase()}
                    </div>
                  )}

                  <div className={`max-w-[85%] sm:max-w-[72%] ${isOwn ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                    {showAuthor && !isOwn && (
                      <span className="text-[10px] sm:text-xs font-semibold text-neutral-600 px-1">{msg.author}</span>
                    )}

                    <div className={msg.isAI ? 'message-ai' : isOwn ? 'message-own' : 'message-other'}>
                      {msg.isAI && (
                        <div className="flex items-center gap-1.5 mb-1.5 text-[10px] sm:text-xs font-semibold text-secondary-700">
                          <SparklesIcon className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Community AI · via Ably AI Transport</span>
                          <span className="sm:hidden">AI Assistant</span>
                        </div>
                      )}
                      <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>

                      {/* Like button */}
                      <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-current/10">
                        <button
                          onClick={() => toggleLike(msg.id)}
                          className="flex items-center gap-1 text-[10px] sm:text-xs transition-all hover:scale-110
                                     min-h-[44px] sm:min-h-0 px-2 py-1 sm:p-0 -mx-2 sm:mx-0 rounded sm:rounded-none"
                          aria-label={msg.likes?.includes(member.name) ? 'Unlike message' : 'Like message'}
                        >
                          {msg.likes?.includes(member.name) ? (
                            <HeartIconSolid className="w-4 h-4 text-warm-500" />
                          ) : (
                            <HeartIconOutline className="w-4 h-4 text-neutral-400 hover:text-warm-400" />
                          )}
                          {msg.likes && msg.likes.length > 0 && (
                            <span className={msg.likes.includes(member.name) ? 'text-warm-600 font-semibold' : 'text-neutral-500'}>
                              {msg.likes.length}
                            </span>
                          )}
                        </button>
                        {msg.likes && msg.likes.length > 0 && (
                          <span className="text-[9px] sm:text-[10px] text-neutral-400 hidden sm:inline">
                            {msg.likes.slice(0, 3).join(', ')}
                            {msg.likes.length > 3 && ` +${msg.likes.length - 3} more`}
                          </span>
                        )}
                      </div>
                    </div>

                    <span className={`text-[9px] sm:text-[10px] text-neutral-500 px-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                      {formatDistanceToNow(msg.timestamp, { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )
            })}

            {/* Typing indicator */}
            {typingUsers.size > 0 && (
              <div className="flex items-start gap-2 sm:gap-3 animate-fade-in">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-br from-primary-400 to-secondary-400 flex-shrink-0 flex items-center justify-center mt-1 shadow-sm">
                  <div className="flex gap-0.5">
                    <span className="w-1 h-1 bg-white rounded-full animate-pulse-soft" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 bg-white rounded-full animate-pulse-soft" style={{ animationDelay: '200ms' }} />
                    <span className="w-1 h-1 bg-white rounded-full animate-pulse-soft" style={{ animationDelay: '400ms' }} />
                  </div>
                </div>
                <div className="max-w-[85%] sm:max-w-[72%] bg-white border border-primary-200 rounded-xl rounded-bl-sm px-3 py-2 shadow-sm">
                  <p className="text-xs sm:text-sm text-neutral-600 italic">
                    {Array.from(typingUsers).length === 1
                      ? `${Array.from(typingUsers)[0]} is typing...`
                      : Array.from(typingUsers).length === 2
                      ? `${Array.from(typingUsers)[0]} and ${Array.from(typingUsers)[1]} are typing...`
                      : `${Array.from(typingUsers)[0]}, ${Array.from(typingUsers)[1]} and ${Array.from(typingUsers).length - 2} other${Array.from(typingUsers).length - 2 === 1 ? '' : 's'} are typing...`
                    }
                  </p>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </main>

          {/* Input */}
          <footer className="px-3 sm:px-6 py-3 sm:py-4 border-t border-primary-200 bg-white/80 backdrop-blur-md shadow-sm">
            <div className="flex gap-2 sm:gap-3 items-end">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Write something…"
                  rows={1}
                  className="w-full px-3 sm:px-4 py-2.5 sm:py-3 pr-12 rounded-xl border border-primary-200 bg-primary-50/30
                             text-neutral-800 placeholder-neutral-400 text-sm font-sans resize-none
                             focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400
                             transition-all max-h-32 overflow-y-auto shadow-sm"
                  style={{ minHeight: '44px' }}
                />
              </div>

              <button
                onClick={sendMessage}
                disabled={!input.trim()}
                className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-r from-primary-500 to-primary-600
                           hover:from-primary-600 hover:to-primary-700 disabled:from-neutral-300 disabled:to-neutral-300
                           flex items-center justify-center transition-all duration-200 flex-shrink-0 shadow-lg
                           disabled:shadow-none"
                aria-label="Send message"
              >
                <PaperAirplaneIcon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </button>
            </div>

            <p className="text-[9px] sm:text-[10px] text-neutral-500 mt-2 text-center hidden sm:flex items-center justify-center gap-1 flex-wrap">
              <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">Enter</kbd> to send ·{' '}
              <kbd className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded border border-neutral-200">Shift+Enter</kbd> for new line ·{' '}
              <span className="flex items-center gap-1">
                Use <SparklesIcon className="w-3 h-3" /> <strong>AI Assistant</strong> for help
              </span>
            </p>
          </footer>
        </div>

        {/* ── AI Transport sidebar (desktop) / full screen (mobile) ──────── */}
        {/* Desktop: sidebar */}
        <div className={`hidden lg:block transition-all duration-300 overflow-hidden flex-shrink-0 ${
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

        {/* Mobile: full-screen overlay with slide-up animation */}
        {showAi && (
          <div className="lg:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-sm animate-fade-in"
               onClick={() => setShowAi(false)}>
            <div className="absolute inset-x-0 bottom-0 top-16 bg-white animate-slide-up-mobile"
                 onClick={(e) => e.stopPropagation()}>
              <div className="h-full flex flex-col">
                {/* Mobile AI header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-primary-200 bg-white/80 backdrop-blur-sm shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-br from-secondary-400 to-primary-400 rounded-xl">
                      <SparklesIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-neutral-800">{communityName} Assistant</p>
                      <p className="text-[10px] text-neutral-500 flex items-center gap-1">
                        <CheckCircleIcon className="w-3 h-3 text-accent-500" />
                        Powered by Ably AI Transport
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowAi(false)}
                    className="w-10 h-10 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center
                               text-neutral-600 hover:text-neutral-800 hover:bg-neutral-200 transition-all"
                    aria-label="Close AI Assistant"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <AiTransportPanel
                    ablyClient={ablyClient}
                    memberToken={member.token}
                    memberName={member.name}
                    communityName={communityName}
                    onPostToChat={postAiResponseToChat}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
