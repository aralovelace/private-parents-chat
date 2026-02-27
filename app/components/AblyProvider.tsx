'use client'

import Ably from 'ably'
import { AblyProvider as AblyReactProvider, ChannelProvider } from 'ably/react'
import { useMemo, createContext, useContext, ReactNode } from 'react'

// ── Expose the raw Ably client via context ─────────────────────────────────
// AiTransport needs the Realtime client directly (not via the @ably/react hooks)
// so it can subscribe to dynamically-named ai:<conversationId> channels.

const AblyClientContext = createContext<Ably.Realtime | null>(null)

export function useAblyClient(): Ably.Realtime {
  const client = useContext(AblyClientContext)
  if (!client) throw new Error('useAblyClient must be used inside AblyProvider')
  return client
}

// ──────────────────────────────────────────────────────────────────────────

interface Props {
  memberToken: string
  clientId: string
  children: ReactNode
}

export function AblyProvider({ memberToken, clientId, children }: Props) {
  const channel = process.env.NEXT_PUBLIC_CHAT_CHANNEL || 'community:members-only'

  /**
   * Token auth: the API key never reaches the browser.
   * The client fetches a short-lived token from /api/ably-token.
   * That token is scoped to:
   *   - The community chat channel (publish + subscribe + presence)
   *   - ai:* channels (subscribe + history) for AI Transport
   */
  const client = useMemo(() => {
    return new Ably.Realtime({
      authUrl: `/api/ably-token?memberToken=${encodeURIComponent(memberToken)}&clientId=${encodeURIComponent(clientId)}`,
      clientId,
    })
  }, [memberToken, clientId])

  return (
    <AblyClientContext.Provider value={client}>
      <AblyReactProvider client={client}>
        <ChannelProvider channelName={channel} options={{ params: { rewind: '50' } }}>
          {children}
        </ChannelProvider>
      </AblyReactProvider>
    </AblyClientContext.Provider>
  )
}
