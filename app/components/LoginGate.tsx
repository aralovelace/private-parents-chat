'use client'

import { useState, FormEvent } from 'react'

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

    // Validate token by attempting to get an Ably token
    try {
      const res = await fetch(
        `/api/ably-token?memberToken=${encodeURIComponent(token)}&clientId=${encodeURIComponent(name)}`
      )
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Invalid access token')
        setLoading(false)
        return
      }
      onLogin({ name: name.trim(), token })
    } catch {
      setError('Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-ink-800 mb-6">
            <svg className="w-8 h-8 text-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl text-ink-900 mb-2">{communityName}</h1>
          <p className="text-ink-500 text-sm">A private space for members only</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-ink-100 shadow-lg shadow-ink-200/30 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">

            <div>
              <label className="block text-xs font-semibold text-ink-500 uppercase tracking-widest mb-2">
                Your name
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="How should we call you?"
                className="w-full px-4 py-3 rounded-xl border border-ink-200 bg-parchment
                           text-ink-800 placeholder-ink-300 font-sans text-sm
                           focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold
                           transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-500 uppercase tracking-widest mb-2">
                Member access token
              </label>
              <input
                type="password"
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="••••••••••••"
                className="w-full px-4 py-3 rounded-xl border border-ink-200 bg-parchment
                           text-ink-800 placeholder-ink-300 font-mono text-sm
                           focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold
                           transition-all"
                required
              />
              <p className="mt-1.5 text-xs text-ink-400">
                Don&rsquo;t have a token? Ask a current member to invite you.
              </p>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-ember text-sm bg-ember/5 border border-ember/20 rounded-lg px-4 py-3">
                <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim() || !token.trim()}
              className="w-full bg-ink-800 hover:bg-ink-700 disabled:bg-ink-300
                         text-parchment font-semibold text-sm py-3.5 rounded-xl
                         transition-all duration-200 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Verifying…
                </>
              ) : (
                <>
                  Enter the community
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-ink-400 mt-6">
          🔒 Messages are private and visible only to members
        </p>
      </div>
    </div>
  )
}
