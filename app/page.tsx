'use client'

import { useState, useEffect } from 'react'
import { AblyProvider } from './components/AblyProvider'
import { LoginGate } from './components/LoginGate'
import { ChatRoom }  from './components/ChatRoom'

export default function Home() {
  const [member, setMember] = useState<{ name: string; token: string } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Restore session from localStorage on mount
  useEffect(() => {
    const savedMember = localStorage.getItem('community-chat-member')
    if (savedMember) {
      try {
        setMember(JSON.parse(savedMember))
      } catch {
        localStorage.removeItem('community-chat-member')
      }
    }
    setIsLoading(false)
  }, [])

  const handleLogin = (memberData: { name: string; token: string }) => {
    setMember(memberData)
    localStorage.setItem('community-chat-member', JSON.stringify(memberData))
  }

  const handleLogout = () => {
    setMember(null)
    localStorage.removeItem('community-chat-member')
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-ink-400">Loading...</div>
      </div>
    )
  }

  if (!member) {
    return <LoginGate onLogin={handleLogin} />
  }

  return (
    <AblyProvider memberToken={member.token} clientId={member.name}>
      <ChatRoom member={member} onLogout={handleLogout} />
    </AblyProvider>
  )
}
