'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Ably from 'ably'

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

      // Now trigger the server-side stream
      try {
        const res = await fetch('/api/ai-stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, conversationId, memberToken }),
        })

        if (!res.ok) {
          const data = await res.json()
          setState(prev => ({
            ...prev,
            isStreaming: false,
            error: data.error || 'AI assistant unavailable',
          }))
          cleanupChannel()
        }
        // If ok, the stream is now flowing via Ably — nothing more to do here
      } catch (err) {
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
    <div className="flex flex-col h-full bg-amber-50/60 border-l border-gold/30">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gold/20 bg-amber-50">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <div>
            <p className="text-sm font-semibold text-ink-800">{communityName} Assistant</p>
            <p className="text-[10px] text-ink-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              Powered by Ably AI Transport
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {history.length === 0 && !isStreaming && (
          <div className="text-center py-8">
            <p className="text-sm text-ink-500 leading-relaxed">
              Hi {memberName}! Ask me anything — I can help with parenting questions, 
              summarise discussions, or just chat.
            </p>
            <div className="mt-4 space-y-2">
              {[
                'What are some screen-free activities for toddlers?',
                'Summarise recent chat discussions',
                'Tips for getting kids to sleep earlier?',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => { setQuestion(suggestion); ask(suggestion); setHistory(prev => [...prev, { role: 'user', text: suggestion }]) }}
                  className="block w-full text-left text-xs px-3 py-2 rounded-lg
                             bg-white border border-gold/30 text-ink-600 hover:bg-amber-50
                             hover:border-gold/60 transition-all"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {history.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-ink-800 text-parchment rounded-br-sm'
                : 'bg-white border border-gold/30 text-ink-700 rounded-bl-sm'
            }`}>
              {msg.text}
              {msg.role === 'ai' && onPostToChat && (
                <button
                  onClick={() => onPostToChat(msg.text)}
                  className="block mt-2 text-[10px] text-amber-600 hover:text-ember font-semibold"
                >
                  📢 Share to group chat
                </button>
              )}
            </div>
          </div>
        ))}

        {/* Live streaming tokens */}
        {isStreaming && (
          <div className="flex justify-start">
            <div className="max-w-[85%] rounded-xl rounded-bl-sm px-3 py-2 text-sm leading-relaxed
                            bg-white border border-gold/30 text-ink-700">
              {streamingText || (
                <span className="flex gap-1 items-center text-ink-400">
                  <span className="w-1.5 h-1.5 bg-ink-300 rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-300 rounded-full animate-pulse" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-ink-300 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
                </span>
              )}
              {/* Streaming cursor */}
              {streamingText && <span className="animate-pulse opacity-60">▍</span>}
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-ember bg-ember/5 border border-ember/20 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gold/20">
        <div className="flex gap-2">
          <input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAsk()}
            placeholder="Ask the assistant…"
            disabled={isStreaming}
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-gold/30 bg-white
                       text-ink-800 placeholder-ink-300 focus:outline-none focus:ring-2
                       focus:ring-gold/40 focus:border-gold transition-all disabled:opacity-50"
          />
          <button
            onClick={handleAsk}
            disabled={isStreaming || !question.trim()}
            className="px-3 py-2 rounded-lg bg-ink-800 hover:bg-ember disabled:bg-ink-300
                       text-white text-sm transition-all"
          >
            {isStreaming ? '…' : '→'}
          </button>
        </div>
        <p className="mt-1.5 text-[9px] text-ink-400 text-center">
          Responses stream via Ably — resumable if you switch tabs
        </p>
      </div>
    </div>
  )
}
