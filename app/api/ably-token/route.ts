import Ably from 'ably'
import { NextRequest, NextResponse } from 'next/server'
import { validateMemberToken } from '@/lib/auth'

/**
 * Ably Token Request endpoint.
 *
 * The client never sees the real API key. Instead it asks this endpoint
 * for a short-lived Ably TokenRequest that it then uses to connect.
 *
 * The `memberToken` query param is a simple shared secret that gates access.
 * In production swap this out for a real auth system (NextAuth, Clerk, etc.)
 */
export async function GET(req: NextRequest) {
  const memberToken = req.nextUrl.searchParams.get('memberToken')
  const clientId     = req.nextUrl.searchParams.get('clientId') || 'anonymous'

  // --- Member gate (centralized validation) ---
  const validation = validateMemberToken(memberToken, '[ably-token]')
  if (!validation.valid) {
    const isDevelopment = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      {
        error: validation.error || 'Access denied',
        ...(isDevelopment && validation.debugInfo ? { debugInfo: validation.debugInfo } : {}),
      },
      { status: 403 }
    )
  }

  const ably = new Ably.Rest(process.env.ABLY_API_KEY!)

  // Create a token request scoped to the community channel only
  const tokenRequest = await ably.auth.createTokenRequest({
    clientId,
    capability: {
      // Allow members to publish + subscribe + get presence on the members channel
      [`${process.env.NEXT_PUBLIC_CHAT_CHANNEL || 'community:members-only'}`]: [
        'publish',
        'subscribe',
        'presence',
      ],
      // Allow members to subscribe to their own AI Transport conversation channels
      // (subscribe only — the server publishes AI tokens, clients only read them)
      // The wildcard lets each member subscribe to ai:<any-conversationId>
      'ai:*': ['subscribe', 'history'],
    },
    // Token expires after 1 hour
    ttl: 3600 * 1000,
  })

  return NextResponse.json(tokenRequest)
}
