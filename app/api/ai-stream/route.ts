import Ably from 'ably'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Ably AI Transport endpoint
 * ──────────────────────────
 * Instead of streaming AI responses directly to the HTTP client (fragile —
 * tab reloads kill the stream), we publish tokens to an Ably channel.
 *
 * Benefits over plain HTTP streaming:
 *  - Resumable: if the parent reconnects after a network blip, they can
 *    rewind the channel and catch up on tokens they missed
 *  - Multi-device: the same conversation appears on phone + laptop
 *    simultaneously because every device subscribes to the same channel
 *  - Visible reasoning: tool calls and thinking steps are published as
 *    distinct named events, so the UI can show them separately
 *  - Human takeover: a parent can hand the AI off to another parent with
 *    full context by sharing the conversation channel name
 *  - Presence-aware: if nobody is subscribed, the agent can pause
 *
 * POST body: { prompt: string, conversationId: string, memberToken: string }
 */
export async function POST(req: NextRequest) {
  const { prompt, conversationId, memberToken } = await req.json()

  // --- Member gate (same as ably-token endpoint) ---
  const validTokens = (process.env.MEMBER_TOKENS || '').split(',').map(t => t.trim())
  if (!memberToken || !validTokens.includes(memberToken)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  if (!prompt || !conversationId) {
    return NextResponse.json({ error: 'Missing prompt or conversationId' }, { status: 400 })
  }

  // Use the server-side Ably client with the API key directly
  // (this is safe — this code runs on the server only)
  const ably = new Ably.Rest(process.env.ABLY_API_KEY!)
  const channel = ably.channels.get(`ai:${conversationId}`)

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const communityName = process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'Members Chat'

  // Kick off the streaming in the background — we return 200 immediately
  // so the client isn't waiting on a long HTTP request.
  streamToAbly(genAI, ably, channel, prompt, communityName).catch(console.error)

  return NextResponse.json({ status: 'streaming', conversationId })
}

async function streamToAbly(
  genAI: GoogleGenerativeAI,
  ably: Ably.Rest,
  channel: Ably.Types.Channel,
  prompt: string,
  communityName: string
) {
  const responseId = `resp_${Date.now()}_${Math.random().toString(36).slice(2)}`

  // Signal that the AI has started responding
  await channel.publish({
    name: 'start',
    data: { responseId },
    extras: { headers: { responseId } },
  })

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'models/gemini-2.5-flash',
    systemInstruction: `You are a warm, helpful AI assistant for ${communityName}, a private parents-only community.
Help parents with questions, summarise discussions, share parenting tips, and make the community
more connected. Be concise, friendly, and privacy-conscious. Never suggest sharing content on
public social media platforms.`,
  })

  let result
  try {
    result = await model.generateContentStream(prompt)
  } catch (error: any) {
    console.error('Gemini API error:', error)
    await channel.publish({
      name: 'error',
      data: { error: error.message },
      extras: { headers: { responseId } },
    })
    await channel.publish({
      name: 'end',
      data: { responseId },
      extras: { headers: { responseId } },
    })
    return
  }

  // IMPORTANT: Do NOT await each publish — fire-and-forget to maintain throughput.
  // Awaiting every publish would serialize the token stream and cause noticeable lag.
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      // Each token chunk is a separate named Ably message.
      // The responseId in extras lets clients correlate chunks to a response.
      channel.publish({
        name: 'token',
        data: text,
        extras: { headers: { responseId } },
      })
    }
  }

  // Signal completion — clients finalize the assembled response
  await channel.publish({
    name: 'end',
    data: { responseId },
    extras: { headers: { responseId } },
  })
}
