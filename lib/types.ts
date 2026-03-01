export interface ChatMessage {
  id: string
  author: string
  text: string
  timestamp: number
  isAI?: boolean
  likes?: string[] // Array of member names who liked this message
}

export interface Member {
  clientId: string
  joinedAt: number
}
