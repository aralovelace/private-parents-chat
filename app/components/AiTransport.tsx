'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Ably from 'ably'
import { SparklesIcon, PaperAirplaneIcon, UserCircleIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline'
import { CheckCircleIcon } from '@heroicons/react/24/solid'

interface AiTransportProps {
  /** The Ably Realtime client (already authed via token auth) */
  ablyClient: Ably.Realtime
  /** Member's invite token — passed to the server to authorise the AI request */
  memberToken: string
  /** Called with each completed AI response */
  onResponse: (text: string, conversationId: string) => void
  /** Community name for the assistant label */
  communityName?: string
}

interface AiState {
  isStreaming: boolean
  streamingText: string
  conversationId: string | null
  error: string | null
}

/**
 * AiTransport
 * ───────────
 * Implements Ably AI Transport pattern for the community AI assistant.
 *
 * Instead of streaming over HTTP (which breaks on tab reload/network issues),
 * tokens flow through an Ably channel:
 *
 *   1. User submits a question
 *   2. Client subscribes to  ai:<conversationId>  channel with rewind=2m
 *      (so any tokens published before the subscription was ready aren't lost)
 *   3. Client POSTs to /api/ai-stream  (returns immediately with 200)
 *   4. Server streams from OpenAI → publishes tokens to the Ably channel
 *   5. Client assembles tokens in real-time
 *   6. On 'end' event, the full response is finalised
 *
 * Resumability: if the browser tab is backgrounded or the network drops
 * mid-stream, the rewind parameter replays the last 2 minutes of tokens
 * when the client reconnects — no tokens are lost.
 */
export function useAiTransport({
  ablyClient,
  memberToken,
  onResponse,
  communityName = 'Community',
}: AiTransportProps) {
  const [state, setState] = useState<AiState>({
    isStreaming: false,
    streamingText: '',
    conversationId: null,
    error: null,
  })

  // Keep a stable ref to the current Ably channel subscription
  const channelRef = useRef<Ably.RealtimeChannel | null>(null)
  const streamingTextRef = useRef('')

  const cleanupChannel = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.unsubscribe()
      channelRef.current.detach().catch(() => {})
      channelRef.current = null
    }
  }, [])

  // Clean up on unmount
  useEffect(() => {
    return () => cleanupChannel()
  }, [cleanupChannel])

  const ask = useCallback(
    async (prompt: string) => {
      if (state.isStreaming) return

      // Each question gets a fresh conversation channel so responses never mix
      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2)}`
      streamingTextRef.current = ''

      setState({
        isStreaming: true,
        streamingText: '',
        conversationId,
        error: null,
      })

      // Clean up any previous channel subscription
      cleanupChannel()

      /**
       * Subscribe BEFORE posting to the server.
       *
       * This is the key pattern: we set up the Ably subscription first
       * with rewind=2m, then fire the API request. Even if the server
       * publishes tokens before our subscription is fully established,
       * the rewind will replay them when we attach.
       */
      const channel = ablyClient.channels.get(`ai:${conversationId}`, {
        params: { rewind: '2m' },
      })

      channelRef.current = channel

      channel.subscribe('token', (message) => {
        const token: string = message.data
        streamingTextRef.current += token
        setState(prev => ({ ...prev, streamingText: streamingTextRef.current }))
      })

      channel.subscribe('end', () => {
        const fullResponse = streamingTextRef.current
        setState(prev => ({
          ...prev,
          isStreaming: false,
          streamingText: '',
        }))
        onResponse(fullResponse, conversationId)
        // Slight delay before cleanup so rewind can still work if needed
        setTimeout(cleanupChannel, 5000)
      })

      channel.subscribe('start', () => {
        // Optional: could show a "thinking" indicator here
      })

      channel.subscribe('error', (message) => {
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: message.data.error || 'AI assistant encountered an error',
        }))
        cleanupChannel()
      })

      // Now trigger the server-side stream
      try {
        const res = await fetch('/api/ai-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, conversationId, memberToken }),
        })

        if (!res.ok) {
          const data = await res.json()

          // Log debug info to console in development
          if (data.debugInfo) {
            console.error('[AI Transport] Server error debug info:', data.debugInfo)
          }

          // Show user-friendly error message
          let errorMessage = data.error || 'AI assistant unavailable'

          // Distinguish between auth errors and server config errors
          if (errorMessage.includes('Server configuration error')) {
            errorMessage = 'Service temporarily unavailable. Please contact support.'
          }

          setState(prev => ({
            ...prev,
            isStreaming: false,
            error: errorMessage,
          }))
          cleanupChannel()
        }
        // If ok, the stream is now flowing via Ably — nothing more to do here
      } catch (err) {
        console.error('[AI Transport] Network error:', err)
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: 'Could not reach the AI assistant',
        }))
        cleanupChannel()
      }
    },
    [state.isStreaming, ablyClient, memberToken, onResponse, cleanupChannel]
  )

  return { ...state, ask }
}

/**
 * AiTransportPanel
 * ─────────────────
 * A self-contained UI component for the AI assistant sidebar/panel.
 * Uses useAiTransport internally.
 */
export function AiTransportPanel({
  ablyClient,
  memberToken,
  memberName,
  communityName = 'Community',
  onPostToChat,
}: {
  ablyClient: Ably.Realtime
  memberToken: string
  memberName: string
  communityName?: string
  /** Optional: post an AI response back to the main chat channel */
  onPostToChat?: (text: string) => void
}) {
  const [question, setQuestion] = useState('')
  const [history, setHistory] = useState<Array<{ role: 'user' | 'ai'; text: string }>>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const { isStreaming, streamingText, error, ask } = useAiTransport({
    ablyClient,
    memberToken,
    communityName,
    onResponse: (text) => {
      setHistory(prev => [...prev, { role: 'ai', text }])
    },
  })

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history, streamingText])

  function handleAsk() {
    const q = question.trim()
    if (!q || isStreaming) return
    setHistory(prev => [...prev, { role: 'user', text: q }])
    setQuestion('')
    ask(q)
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-secondary-50/40 to-primary-50/20 lg:border-l border-primary-200">
      {/* Header - hidden on mobile (shown in parent overlay) */}
      <div className="hidden lg:block px-4 py-3 border-b border-primary-200 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gradient-to-br from-secondary-400 to-primary-400 rounded-xl">
            <SparklesIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-neutral-800">{communityName} Assistant</p>
            <p className="text-[10px] text-neutral-500 flex items-center gap-1.5">
              <CheckCircleIcon className="w-3 h-3 text-accent-500" />
              Powered by Ably AI Transport
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
        {history.length === 0 && !isStreaming && (
          <div className="py-4 sm:py-6 px-3">
            <div className="flex items-start gap-2 mb-4">
              <ChatBubbleLeftRightIcon className="w-5 h-5 text-primary-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed">
                Hi {memberName}! Need inspiration, advice, or just someone to talk to? Here are some ideas:
              </p>
            </div>
            <div className="space-y-4 text-xs sm:text-sm text-neutral-700 leading-relaxed">
              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-primary-100">
                <p className="font-semibold text-neutral-800">&quot;Nature Scavenger Hunt&quot;</p>
                <p className="text-neutral-600 mt-0.5">Great question! It&apos;s wonderful to encourage outdoor exploration and interaction. Here are fun activities for little ones: &quot;Treasure Hunt&quot; — hide painted rocks or small toys in the garden. &quot;Building & Stacking&quot; Blocks. Duplo or mega Bloks are fantastic. Use natural materials too like sticks, pine cones or sand and add scoops and diggers! &quot;Messy Play&quot; — Finger paint, play dough, or rice bins. Adventures! — A walk to the park, the library, or market, or sand and add scoops and play simple instruments, or sing together — music is magical.</p>
              </div>
              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-secondary-100">
                <p className="font-semibold text-neutral-800">&quot;Puzzles&quot;</p>
                <p className="text-neutral-600 mt-0.5">Chunky wooden puzzles or simple jigsaws — start with 4-6 pieces and progress from there. Sorting games — matching colours, playing with dolls or animal figures, or building simple worlds with toy cars.</p>
              </div>
              <div className="bg-white/60 backdrop-blur-sm rounded-xl p-3 border border-accent-100">
                <p className="font-semibold text-neutral-800">&quot;Tidy up&quot; toys or water plants</p>
                <p className="text-neutral-600 mt-0.5">Toddlers love helping — even if it&apos;s slower! These activities give you some screen-free bonding time while building curiosity and motor skills.</p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-primary-200">
              <p className="text-[11px] text-neutral-500 mb-2 flex items-center gap-1.5">
                <SparklesIcon className="w-3.5 h-3.5" />
                Quick questions:
              </p>
              <div className="space-y-2">
                {[
                  'Summarise recent chat discussions',
                  'Tips for getting kids to sleep earlier?',
                  'How do I handle tantrums in public?',
                ].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => { setQuestion(suggestion); ask(suggestion); setHistory(prev => [...prev, { role: 'user', text: suggestion }]) }}
                    className="block w-full text-left text-[11px] sm:text-xs px-3 py-2.5 sm:py-2 rounded-lg
                               bg-white border border-primary-200 text-neutral-700 hover:bg-primary-50
                               hover:border-primary-300 hover:shadow-sm transition-all min-h-[44px] sm:min-h-0 flex items-center"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'ai' && (
              <div className="flex-shrink-0 mt-1">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-secondary-400 to-primary-400 flex items-center justify-center">
                  <SparklesIcon className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[80%] rounded-xl px-3 py-2 text-xs sm:text-sm leading-relaxed break-words whitespace-pre-line ${
              msg.role === 'user'
                ? 'bg-primary-600 text-white rounded-br-sm shadow-sm'
                : 'bg-white border border-secondary-200 text-neutral-700 rounded-bl-sm shadow-sm'
            }`}>
              {msg.text}
              {msg.role === 'ai' && onPostToChat && (
                <button
                  onClick={() => onPostToChat(msg.text)}
                  className="flex items-center gap-1.5 mt-2 text-[10px] text-primary-600 hover:text-primary-700 font-semibold min-h-[44px] sm:min-h-0
                             px-2 py-1 sm:p-0 -mx-2 sm:mx-0 rounded sm:rounded-none transition-colors"
                >
                  <ChatBubbleLeftRightIcon className="w-3.5 h-3.5" />
                  Share to group chat
                </button>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="flex-shrink-0 mt-1">
                <UserCircleIcon className="w-6 h-6 text-primary-400" />
              </div>
            )}
          </div>
        ))}

        {/* Live streaming tokens */}
        {isStreaming && (
          <div className="flex gap-2 justify-start">
            <div className="flex-shrink-0 mt-1">
              <div className="w-6 h-6 rounded-full bg-gradient-to-br from-secondary-400 to-primary-400 flex items-center justify-center">
                <SparklesIcon className="w-3.5 h-3.5 text-white animate-pulse" />
              </div>
            </div>
            <div className="max-w-[85%] sm:max-w-[80%] rounded-xl rounded-bl-sm px-3 py-2 text-xs sm:text-sm leading-relaxed
                            bg-white border border-secondary-200 text-neutral-700 break-words whitespace-pre-line shadow-sm">
              {streamingText || (
                <span className="flex gap-1 items-center text-neutral-400">
                  <span className="w-1.5 h-1.5 bg-secondary-300 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-primary-300 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-accent-300 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                </span>
              )}
              {/* Streaming cursor */}
              {streamingText && <span className="animate-pulse opacity-60">▍</span>}
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-warm-700 bg-warm-50 border border-warm-200 rounded-lg px-3 py-2 shadow-sm">
            {error}
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-primary-200 bg-white/80 backdrop-blur-sm">
        <div className="flex gap-2">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            placeholder="Ask the assistant…"
            disabled={isStreaming}
            className="flex-1 text-xs sm:text-sm px-3 py-2.5 sm:py-2 rounded-lg border border-primary-200 bg-white
                       text-neutral-800 placeholder-neutral-400 focus:outline-none focus:ring-2
                       focus:ring-primary-400 focus:border-primary-400 transition-all disabled:opacity-50 shadow-sm"
            style={{ minHeight: '44px' }}
          />
          <button
            onClick={handleAsk}
            disabled={isStreaming || !question.trim()}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                       disabled:from-neutral-300 disabled:to-neutral-300 text-white text-sm transition-all
                       min-w-[44px] min-h-[44px] flex items-center justify-center shadow-sm disabled:shadow-none"
            aria-label="Send question"
          >
            {isStreaming ? (
              <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <PaperAirplaneIcon className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-neutral-500 text-center hidden sm:flex items-center justify-center gap-1">
          <CheckCircleIcon className="w-3 h-3 text-accent-500" />
          Responses stream via Ably — resumable if you switch tabs
        </p>
      </div>
    </div>
  )
}
