import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest, NextResponse } from 'next/server'
import { validateMemberToken } from '@/lib/auth'

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

  // --- Member gate (centralized validation) ---
  const validation = validateMemberToken(memberToken, '[ai-stream]')
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

  if (!prompt || !conversationId) {
    return NextResponse.json({ error: 'Missing prompt or conversationId' }, { status: 400 })
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const communityName = process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'Members Chat'
  const ablyApiKey = process.env.ABLY_API_KEY!

  // Extract app ID from API key for REST endpoint
  const appId = ablyApiKey.split('.')[0]

  // Kick off the streaming in the background — we return 200 immediately
  // so the client isn't waiting on a long HTTP request.
  streamToAbly(genAI, ablyApiKey, appId, conversationId, prompt, communityName).catch((err) => {
    console.error('AI streaming error:', err)
    // Publish error to channel so client knows what happened
    publishToAbly(ablyApiKey, appId, conversationId, 'error', { error: err.message || 'AI streaming failed' }).catch(console.error)
  })

  return NextResponse.json({ status: 'streaming', conversationId })
}

// Helper to publish messages to Ably using REST API directly
async function publishToAbly(
  apiKey: string,
  appId: string,
  conversationId: string,
  name: string,
  data: any,
  extras?: any
) {
  const url = `https://rest.ably.io/channels/ai:${encodeURIComponent(conversationId)}/messages`

  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(apiKey).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name, data, extras }),
  })
}

async function streamToAbly(
  genAI: GoogleGenerativeAI,
  apiKey: string,
  appId: string,
  conversationId: string,
  prompt: string,
  communityName: string
) {
  const responseId = `resp_${Date.now()}_${Math.random().toString(36).slice(2)}`

  // Signal that the AI has started responding
  await publishToAbly(apiKey, appId, conversationId, 'start', { responseId }, { headers: { responseId } })

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'models/gemini-2.5-flash',
    systemInstruction: `You are a warm, helpful AI assistant for ${communityName}, a private parents-only community.
Help parents with questions, summarise discussions, share parenting tips, and make the community
more connected. Be concise, friendly, and privacy-conscious. Never suggest sharing content on
public social media platforms.

IMPORTANT: Format your responses with clear structure using this style:
- Use "Quoted Titles" for main topics or activities (with regular quote marks, not markdown)
- Write descriptive paragraphs in plain text below each title
- DO NOT use markdown syntax like **, *, bullet points, or #
- Separate sections with line breaks for readability
- Keep responses warm, conversational, and easy to read

Example format:
"Activity Title"
Descriptive text explaining the activity or topic in a natural, flowing paragraph style.

"Another Activity"
More descriptive text with helpful details and practical suggestions.`,
  })

  let result
  try {
    result = await model.generateContentStream(prompt)
  } catch (error: any) {
    console.error('Gemini API error:', error)
    await publishToAbly(apiKey, appId, conversationId, 'error', { error: error.message }, { headers: { responseId } })
    await publishToAbly(apiKey, appId, conversationId, 'end', { responseId }, { headers: { responseId } })
    return
  }

  // IMPORTANT: Do NOT await each publish — fire-and-forget to maintain throughput.
  // Awaiting every publish would serialize the token stream and cause noticeable lag.
  for await (const chunk of result.stream) {
    const text = chunk.text()
    if (text) {
      // Each token chunk is a separate named Ably message.
      // The responseId in extras lets clients correlate chunks to a response.
      publishToAbly(apiKey, appId, conversationId, 'token', text, { headers: { responseId } }).catch(console.error)
    }
  }

  // Signal completion — clients finalize the assembled response
  await publishToAbly(apiKey, appId, conversationId, 'end', { responseId }, { headers: { responseId } })
}
