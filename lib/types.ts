export interface ChatMessage {
  id: string
  author: string
  text: string
  timestamp: number
  isAI?: boolean
}

export interface Member {
  clientId: string
  joinedAt: number
}
