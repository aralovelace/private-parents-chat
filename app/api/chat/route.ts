import {
  CopilotRuntime,
  GoogleGenerativeAIAdapter,
} from '@copilotkit/runtime'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextRequest } from 'next/server'

/**
 * CopilotKit / AG-UI runtime endpoint.
 *
 * This is where the AI community assistant lives. CopilotKit wraps the
 * AG-UI protocol, handling SSE streaming, tool calls, and state sync
 * between the frontend and the Gemini-powered agent.
 *
 * You can swap Gemini for any AG-UI-compatible backend:
 * LangGraph, CrewAI, OpenAI, Mastra, etc.
 */
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

const runtime = new CopilotRuntime()

const serviceAdapter = new GoogleGenerativeAIAdapter({
  model: genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: `You are a warm, helpful AI assistant for a private parents-only community.
Help parents with questions, summarise discussions, share parenting tips, and make the community
more connected. Be concise, friendly, and privacy-conscious. Never suggest sharing content on
public social media platforms.`,
  }),
})

export async function POST(req: NextRequest) {
  const { handleRequest } = await import('@copilotkit/runtime')
  return handleRequest(req, runtime, serviceAdapter)
}

export async function GET(req: NextRequest) {
  const { handleRequest } = await import('@copilotkit/runtime')
  return handleRequest(req, runtime, serviceAdapter)
}
