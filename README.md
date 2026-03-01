# 🏠 Elite Parenting — Private Members Chat for Parents

> A private, real-time chat for parent communities who don't want their family's data on Facebook, WhatsApp, or Instagram.
> Built with **Ably Pub/Sub** (real-time messaging), **Ably AI Transport** (resumable AI streaming), and **AG-UI / CopilotKit** (agent-user interaction).

Built for the [DEV Weekend Challenge: Build for Your Community](https://dev.to/challenges/weekend-2026-02-28).

---

## ✨ Features

- 🔒 **Invite-only access** via tokens — no phone number, no Facebook account required
- 💬 **Real-time parent chat** powered by Ably Pub/Sub
- 👥 **Live presence** — see which parents are online right now
- ⌨️ **Typing indicators** via ephemeral Ably messages
- 📜 **Message history** — last 50 messages loaded on join (Ably rewind)
- 🤖 **AI parenting assistant** streaming via **Ably AI Transport**:
  - Resumable token streaming (survives tab reloads and network drops)
  - Multi-device: same conversation appears on any device
  - "Share to chat" button posts AI responses into the group
- 🎨 Warm parchment-and-ink design — intentionally not Big Tech

---

## 🏗️ Architecture

```
Browser (Next.js)
├── LoginGate          — validates invite token
├── AblyProvider       — Ably Realtime client + raw client via context
│   ├── useChannel     — group chat pub/sub
│   ├── usePresence    — who's online
│   └── useAblyClient  — exposes raw client for AI Transport
├── ChatRoom           — messages, presence, typing indicators
│   └── AiTransportPanel — AI assistant sidebar
│       └── useAiTransport — subscribes to ai:<conversationId> channel
│
Server (Next.js API Routes)
├── /api/ably-token   — issues short-lived tokens (chat + ai:* subscribe)
├── /api/ai-stream    — Ably AI Transport: streams Gemini → Ably channel
└── /api/chat         — CopilotKit / AG-UI runtime (fallback)
```

### Why Ably AI Transport instead of plain HTTP streaming?

| | HTTP streaming | Ably AI Transport |
|---|---|---|
| Tab reload mid-stream | ❌ Stream lost | ✅ Rewind replays missed tokens |
| Network drop | ❌ Must restart | ✅ Reconnects and catches up |
| Multiple devices | ❌ One stream per device | ✅ All devices see the same tokens |
| Visibility | ❌ Black box | ✅ Each token is a named Ably event |
| Human handoff | ❌ Not possible | ✅ Share channel name for full context |

---

## 🚀 Quick Start

### 1. Install

```bash
npm install
# or pnpm install
```

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

| Variable | Where to get it |
|---|---|
| `ABLY_API_KEY` | [Ably Dashboard](https://ably.com/dashboard) → API Keys |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `MEMBER_TOKENS` | Comma-separated invite codes, e.g. `token-alice,token-bob` |
| `NEXT_PUBLIC_COMMUNITY_NAME` | Your community name, e.g. `Park Road Parents` |

### 3. Run

```bash
npm run dev
```

Open http://localhost:3000, enter a name and one of your `MEMBER_TOKENS`.

---

## 🔑 How Ably AI Transport works in this app

### The flow

```
1. Parent opens AI assistant sidebar
2. Client: subscribe to  ai:<conversationId>  channel  ← with rewind=2m
3. Client: POST /api/ai-stream { prompt, conversationId, memberToken }
4. Server: validates token → starts Gemini stream → publishes tokens to Ably
   channel.publish({ name: 'token', data: 'Hello', extras: { headers: { responseId } } })
5. Client: assembles tokens in real-time as they arrive
6. Server: publishes 'end' event → client finalises response
```

### Why subscribe before posting?

We set up the Ably subscription **before** posting to the server. Combined with `rewind=2m`, this means if any tokens are published before our subscription is ready, they'll be replayed when we attach. No tokens are lost.

### The `responseId` pattern

Every token carries a `responseId` in `extras.headers`. This lets you:
- Correlate all tokens that belong to one response
- Build multi-turn conversation histories
- Handle tool calls and results (each gets a `toolCallId` too)

### Token scoping in Ably token auth

The Ably token issued to members grants:
- `community:members-only` — publish + subscribe + presence (group chat)
- `ai:*` — subscribe + history only (AI Transport, read-only)

The server publishes to `ai:*` channels using the full API key server-side. Clients can never publish to AI channels directly.

---

## 📁 Project Structure

```
community-chat/
├── app/
│   ├── api/
│   │   ├── ably-token/route.ts   ← Token auth (chat + ai:* scopes)
│   │   ├── ai-stream/route.ts    ← Ably AI Transport endpoint
│   │   └── chat/route.ts         ← CopilotKit / AG-UI runtime
│   ├── components/
│   │   ├── AblyProvider.tsx      ← Ably setup + exposes raw client
│   │   ├── AiTransport.tsx       ← AI Transport hook + panel UI
│   │   ├── ChatRoom.tsx          ← Chat UI with AI sidebar
│   │   └── LoginGate.tsx         ← Invite token screen
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── lib/types.ts
└── .env.local.example
```

---

## 🔐 Upgrading the auth system

The demo uses shared tokens in an env var. For a real parent group:

- **[Clerk](https://clerk.com)** — magic links (no passwords), built-in Next.js support
- **[NextAuth](https://next-auth.js.org)** — email magic link provider
- **Invite codes stored in a database** — generate per-family codes, expire them after use

The `/api/ably-token` endpoint is the only place to change — the rest of the app doesn't care how the member is authenticated.

---

## 📦 Tech Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- [Ably](https://ably.com/) — Pub/Sub + AI Transport (with built-in React hooks)
- [CopilotKit](https://copilotkit.ai/) + [AG-UI](https://ag-ui.com/) — agent-UI protocol
- **[Google Gemini](https://ai.google.dev/)** (gemini-2.0-flash) — powers the assistant
- [Tailwind CSS](https://tailwindcss.com/)

---

## 📝 License

MIT
