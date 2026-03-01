import { NextResponse } from 'next/server'
import { getMemberTokensStatus } from '@/lib/auth'

/**
 * Health Check Endpoint
 * ────────────────────
 * Provides visibility into server configuration without exposing sensitive values.
 * Useful for debugging deployment issues on Vercel or other platforms.
 *
 * Returns:
 * - Environment configuration status
 * - Token count (without exposing actual tokens)
 * - API key presence checks
 * - Node environment
 *
 * GET /api/health
 */
export async function GET() {
  const tokenStatus = getMemberTokensStatus()

  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    configuration: {
      memberTokensConfigured: tokenStatus.configured,
      validTokenCount: tokenStatus.validTokenCount,
      invalidTokenCount: tokenStatus.invalidTokenCount,
      ablyApiKeyConfigured: !!process.env.ABLY_API_KEY,
      geminiApiKeyConfigured: !!process.env.GEMINI_API_KEY,
      communityName: process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'Not set',
      chatChannel: process.env.NEXT_PUBLIC_CHAT_CHANNEL || 'Not set',
    },
    warnings: [] as string[],
  }

  // Add warnings for common misconfigurations
  if (!tokenStatus.configured) {
    health.warnings.push('MEMBER_TOKENS environment variable is not set')
  }
  if (tokenStatus.validTokenCount === 0 && tokenStatus.configured) {
    health.warnings.push('No valid tokens found in MEMBER_TOKENS')
  }
  if (tokenStatus.invalidTokenCount > 0) {
    health.warnings.push(
      `${tokenStatus.invalidTokenCount} invalid token(s) found in MEMBER_TOKENS (they will be ignored)`
    )
  }
  if (!process.env.ABLY_API_KEY) {
    health.warnings.push('ABLY_API_KEY is not configured')
  }
  if (!process.env.GEMINI_API_KEY) {
    health.warnings.push('GEMINI_API_KEY is not configured')
  }

  // Return 503 if critical configuration is missing
  const criticalMissing = !tokenStatus.configured || tokenStatus.validTokenCount === 0 || !process.env.ABLY_API_KEY
  if (criticalMissing) {
    return NextResponse.json(
      { ...health, status: 'degraded' },
      { status: 503 }
    )
  }

  return NextResponse.json(health)
}
