/**
 * Centralized Authentication & Token Validation
 * ────────────────────────────────────────────
 * Provides token validation with comprehensive format checking and detailed error reporting.
 * Used by both /api/ably-token and /api/ai-stream endpoints.
 *
 * NOTE: This is a simple token-based system suitable for small communities.
 * For production, replace with proper auth (NextAuth.js, Clerk, Supabase, etc.)
 */

interface ValidationResult {
  valid: boolean
  error?: string
  debugInfo?: {
    tokenProvided: boolean
    tokenLength?: number
    validTokenCount: number
    environmentConfigured: boolean
    invalidTokensFound?: number
  }
}

/**
 * Validates a member token against the configured MEMBER_TOKENS environment variable.
 *
 * Performs comprehensive validation:
 * - Checks if token is provided and non-empty
 * - Validates token format (rejects URLs, enforces character rules)
 * - Checks token length (3-200 characters)
 * - Filters out invalid tokens from MEMBER_TOKENS with warnings
 * - Gracefully handles missing MEMBER_TOKENS environment variable
 *
 * @param memberToken - The token provided by the client
 * @param context - Optional context string for logging (e.g., "[ably-token]")
 * @returns ValidationResult with detailed error information
 */
export function validateMemberToken(
  memberToken: string | null | undefined,
  context: string = '[AUTH]'
): ValidationResult {
  const isDevelopment = process.env.NODE_ENV === 'development'

  // Check if token was provided
  if (!memberToken || memberToken.trim() === '') {
    console.warn(`${context} Token validation failed: No token provided`)
    return {
      valid: false,
      error: 'No member token provided',
      debugInfo: {
        tokenProvided: false,
        validTokenCount: 0,
        environmentConfigured: !!process.env.MEMBER_TOKENS,
      },
    }
  }

  const trimmedToken = memberToken.trim()

  // Validate token format
  const formatError = validateTokenFormat(trimmedToken)
  if (formatError) {
    console.warn(`${context} Token validation failed: ${formatError}`, {
      tokenLength: trimmedToken.length,
      tokenPrefix: trimmedToken.substring(0, 10),
    })
    return {
      valid: false,
      error: formatError,
      debugInfo: {
        tokenProvided: true,
        tokenLength: trimmedToken.length,
        validTokenCount: 0,
        environmentConfigured: !!process.env.MEMBER_TOKENS,
      },
    }
  }

  // Get and validate environment tokens
  const envTokens = process.env.MEMBER_TOKENS
  if (!envTokens || envTokens.trim() === '') {
    console.error(`${context} Server configuration error: MEMBER_TOKENS not configured`)
    return {
      valid: false,
      error: 'Server configuration error: No member tokens configured',
      debugInfo: {
        tokenProvided: true,
        tokenLength: trimmedToken.length,
        validTokenCount: 0,
        environmentConfigured: false,
      },
    }
  }

  // Parse and filter valid tokens from environment
  const allTokens = envTokens.split(',').map(t => t.trim())
  const validTokens: string[] = []
  let invalidCount = 0

  for (const token of allTokens) {
    if (!token) continue // Skip empty strings

    const error = validateTokenFormat(token)
    if (error) {
      invalidCount++
      console.warn(`${context} Invalid token in MEMBER_TOKENS (skipped):`, {
        error,
        tokenPrefix: token.substring(0, 20),
      })
      continue
    }

    validTokens.push(token)
  }

  if (validTokens.length === 0) {
    console.error(`${context} Server configuration error: No valid tokens in MEMBER_TOKENS`, {
      totalTokens: allTokens.length,
      invalidTokens: invalidCount,
    })
    return {
      valid: false,
      error: 'Server configuration error: No valid member tokens configured',
      debugInfo: {
        tokenProvided: true,
        tokenLength: trimmedToken.length,
        validTokenCount: 0,
        environmentConfigured: true,
        invalidTokensFound: invalidCount,
      },
    }
  }

  // Check if the provided token matches any valid token
  const isValid = validTokens.includes(trimmedToken)

  if (!isValid) {
    console.warn(`${context} Token validation failed: Invalid member token`, {
      tokenLength: trimmedToken.length,
      validTokenCount: validTokens.length,
    })
    return {
      valid: false,
      error: 'Access denied: Invalid member token',
      debugInfo: {
        tokenProvided: true,
        tokenLength: trimmedToken.length,
        validTokenCount: validTokens.length,
        environmentConfigured: true,
      },
    }
  }

  // Success!
  if (isDevelopment) {
    console.log(`${context} Token validation successful`, {
      tokenLength: trimmedToken.length,
      validTokenCount: validTokens.length,
    })
  }

  return {
    valid: true,
    debugInfo: {
      tokenProvided: true,
      tokenLength: trimmedToken.length,
      validTokenCount: validTokens.length,
      environmentConfigured: true,
    },
  }
}

/**
 * Validates token format according to security rules.
 *
 * Rules:
 * - Must be 3-200 characters long
 * - Cannot start with http://, https://, or -http (common URL mistakes)
 * - Only alphanumeric characters, dashes, and underscores allowed
 *
 * @param token - The token to validate
 * @returns Error message if invalid, null if valid
 */
function validateTokenFormat(token: string): string | null {
  // Check length
  if (token.length < 3) {
    return 'Token is too short (minimum 3 characters)'
  }
  if (token.length > 200) {
    return 'Token length must be between 3-200 characters'
  }

  // Check for URL patterns (common mistake)
  const urlPatterns = [/^https?:\/\//i, /^-https?:\/\//i]
  for (const pattern of urlPatterns) {
    if (pattern.test(token)) {
      return 'Invalid token format: Token cannot be a URL'
    }
  }

  // Check for valid characters (alphanumeric, dash, underscore only)
  const validCharPattern = /^[a-zA-Z0-9_-]+$/
  if (!validCharPattern.test(token)) {
    return 'Token contains invalid characters (only letters, numbers, dashes, and underscores allowed)'
  }

  return null
}

/**
 * Gets count of valid tokens configured in MEMBER_TOKENS.
 * Useful for health checks and debugging.
 *
 * @returns Object with token count and configuration status
 */
export function getMemberTokensStatus(): {
  configured: boolean
  validTokenCount: number
  invalidTokenCount: number
} {
  const envTokens = process.env.MEMBER_TOKENS
  if (!envTokens || envTokens.trim() === '') {
    return { configured: false, validTokenCount: 0, invalidTokenCount: 0 }
  }

  const allTokens = envTokens.split(',').map(t => t.trim()).filter(t => t)
  let validCount = 0
  let invalidCount = 0

  for (const token of allTokens) {
    if (validateTokenFormat(token) === null) {
      validCount++
    } else {
      invalidCount++
    }
  }

  return {
    configured: true,
    validTokenCount: validCount,
    invalidTokenCount: invalidCount,
  }
}
