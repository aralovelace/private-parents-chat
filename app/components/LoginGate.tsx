'use client'

import { useState, FormEvent } from 'react'
import { UserGroupIcon, ArrowRightIcon, ExclamationCircleIcon, LockClosedIcon } from '@heroicons/react/24/outline'

interface Props {
  onLogin: (member: { name: string; token: string }) => void
}

export function LoginGate({ onLogin }: Props) {
  const [name,  setName]  = useState('')
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const communityName = process.env.NEXT_PUBLIC_COMMUNITY_NAME || 'Members Chat'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || !token.trim()) return
    setLoading(true)
    setError('')

    const trimmedToken = token.trim()

    // Pre-flight client-side validation to catch obvious errors early
    const clientValidationError = validateTokenClientSide(trimmedToken)
    if (clientValidationError) {
      setError(clientValidationError)
      setLoading(false)
      return
    }

    // Validate token by attempting to get an Ably token
    try {
      const res = await fetch(
        `/api/ably-token?memberToken=${encodeURIComponent(trimmedToken)}&clientId=${encodeURIComponent(name)}`
      )
      if (!res.ok) {
        const data = await res.json()

        // Log debug info to console in development
        if (data.debugInfo) {
          console.error('[Login] Server validation failed:', data.debugInfo)
        }

        // Show appropriate error message
        let errorMessage = data.error || 'Invalid access token'

        // Distinguish between auth errors and server configuration errors
        if (errorMessage.includes('Server configuration error')) {
          errorMessage = 'Service temporarily unavailable. Please try again later or contact support.'
        }

        setError(errorMessage)
        setLoading(false)
        return
      }
      onLogin({ name: name.trim(), token: trimmedToken })
    } catch (err) {
      console.error('[Login] Network error:', err)
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  // Client-side token format validation (pre-flight check)
  function validateTokenClientSide(token: string): string | null {
    if (token.length < 3) {
      return 'Token is too short. Please check and try again.'
    }

    if (token.length > 200) {
      return 'Token is too long. Please check and try again.'
    }

    // Detect URL tokens (common mistake)
    if (/^https?:\/\//i.test(token) || /^-https?:\/\//i.test(token)) {
      return 'Invalid token format. Please enter your member access token (not a URL).'
    }

    // Check for invalid characters
    if (!/^[a-zA-Z0-9_-]+$/.test(token)) {
      return 'Token contains invalid characters. Only letters, numbers, dashes, and underscores are allowed.'
    }

    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md animate-fade-in">

        {/* Header */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl
                          bg-gradient-to-br from-primary-500 to-secondary-500 mb-5 sm:mb-6 shadow-lg shadow-primary-200/50">
            <UserGroupIcon className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
          </div>
          <h1 className="font-display text-2xl sm:text-3xl text-neutral-900 mb-2">{communityName}</h1>
          <p className="text-neutral-600 text-xs sm:text-sm flex items-center justify-center gap-1.5">
            <LockClosedIcon className="w-3.5 h-3.5" />
            A private space for members only
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-primary-200 shadow-xl shadow-primary-100/50 p-6 sm:p-8">
          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">

            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-2">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="How should we call you?"
                className="w-full px-4 py-3 rounded-xl border border-primary-200 bg-primary-50/30
                           text-neutral-800 placeholder-neutral-400 font-sans text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400
                           transition-all shadow-sm"
                style={{ minHeight: '44px' }}
                required
              />
            </div>

            <div>
              <label className="block text-[10px] sm:text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-2">
                Member access token
              </label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl border border-primary-200 bg-primary-50/30
                           text-neutral-800 placeholder-neutral-400 font-mono text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-primary-400
                           transition-all shadow-sm"
                style={{ minHeight: '44px' }}
                required
              />
              <p className="mt-1.5 text-[10px] sm:text-xs text-neutral-500">
                Don&rsquo;t have a token? Ask a current member to invite you.
              </p>
            </div>

            {error && (
              <div className="flex items-start gap-2 text-warm-700 text-xs sm:text-sm bg-warm-50 border border-warm-300 rounded-lg px-3 sm:px-4 py-3 shadow-sm">
                <ExclamationCircleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <span className="flex-1">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim() || !token.trim()}
              className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700
                         disabled:from-neutral-300 disabled:to-neutral-300 text-white font-semibold text-sm py-3.5 rounded-xl
                         transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-primary-200/50
                         disabled:shadow-none"
              style={{ minHeight: '48px' }}
            >
              {loading ? (
                <>
                  <div className="animate-spin w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
                  Verifying…
                </>
              ) : (
                <>
                  Enter the community
                  <ArrowRightIcon className="w-5 h-5" />
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-[10px] sm:text-xs text-neutral-500 mt-5 sm:mt-6 flex items-center justify-center gap-1.5">
          <LockClosedIcon className="w-3.5 h-3.5 text-accent-500" />
          Messages are private and visible only to members
        </p>
      </div>
    </div>
  )
}
