# Phase 6: Mobile + Web

## Overview

Extend the agent's reach beyond the terminal: Telegram bot for mobile access, web GUI for the full visual experience (onboarding, agent builder canvas, chat, Memory Palace), and local voice input via Whisper. All surfaces connect to the same gateway daemon and share the same memory.

**Estimated effort**: 4-6 weeks

---

## Prerequisites

- Phases 1-5 complete (memory layer, gateway, TUI, batch pipeline, secondary agent)
- HTTP transport for MCP server (stubbed in Phase 1d)
- Web framework decision (Next.js recommended for SSR + API routes)

---

## 6.1 Telegram Gateway

### Architecture

```
User's phone (Telegram)
      ↓  Telegram Bot API
Telegram Bot Adapter (packages/gateway/src/channels/telegram-adapter.ts)
      ↓
Gateway Daemon
      ↓
Agent (Agent SDK or Vercel AI SDK)
      ↓
Memory Layer (same DB)
```

### Key Interface

```typescript
interface TelegramAdapterConfig {
  botToken: string;
  allowedUserIds: number[];    // Allowlist for security
  gateway: Gateway;
}

class TelegramAdapter implements ChannelAdapter {
  constructor(config: TelegramAdapterConfig);
  start(): Promise<void>;
  stop(): Promise<void>;
}

interface ChannelAdapter {
  start(): Promise<void>;
  stop(): Promise<void>;
  sendMessage(content: string): Promise<void>;
}
```

### Implementation Notes

- Use `grammy` or `telegraf` library for Telegram Bot API
- **Security**: Only respond to messages from `allowedUserIds` — no public bot
- **Message routing**: Telegram message → gateway → create/resume agent session → send response back
- **Session management**: Map Telegram chat ID to agent session ID. Resume session on each message
- **Working memory**: Same DB — mobile user sees the same task board as TUI
- **Surface tracking**: Set `surface: 'telegram'` on session logs
- **Rate limiting**: Respect Telegram API rate limits (30 messages/second)
- **Media**: Support text messages initially. Voice notes in 6.3

### Key Flows

**New message from Telegram:**
1. Verify user is in allowlist
2. Check for active session for this chat → resume or create new
3. Pass message to agent as prompt
4. Stream response back via Telegram `sendMessage`
5. If response includes tool usage, show tool indicators

**Slash commands via Telegram:**
- `/tasks` → show kanban board
- `/dream` → trigger batch pipeline
- `/status` → show memory stats

---

## 6.2 Web GUI

### Architecture

```
Browser
   ↓  HTTP / WebSocket
Next.js Server (packages/web/)
   ↓
Gateway Daemon (HTTP API / WebSocket)
   ↓
Agent + Memory Layer
```

### Package

- `packages/web/` — Next.js app (or similar)
- Uses the Aura Obsidian design system from `docs/planning-artifacts/ui-ux-design-spec.md`

### Screens to Implement

Per the UI/UX spec, these screens need implementation:

**Screen 1: Welcome & User Profile (Onboarding Step 1)**
- Centered single-column form
- Questions: name, occupation, use case, communication preference, daily tools
- Design tokens: `surface` background, `surface-container` card, Manrope headings

**Screen 2: Agent Builder Canvas (Onboarding Step 2)**
- Top: Live preview card with glassmorphism
- Bottom: Four-deck tab interface (Identity, Skills/Tools, Context, Settings)
- Card-based selection with horizontal scroll
- Identity presets as visual cards (avatar circle, name, role, tone badge)
- "Build Custom" card with dashed border

**Screen 3: Main Chat Interface**
- Three-column layout: sidebar (conversations), center (chat), right sidebar (working memory + recent facts)
- Chat messages with role-specific styling
- Tool indicators below agent messages
- Context pills above input
- Streaming response rendering

**Screen 4: Memory Palace (Knowledge Base Browser)**
- Two-panel layout: PARA container tree (left), content (right)
- Tabs: Facts, Entities, Skills, Relations
- Confidence bars, type badges, timestamps
- Searchable

**Screen 5: Agent Builder Canvas (Full Version)**
- Enhanced version of Screen 2 with all four decks fully functional
- Multi-agent management

### Key Interface (API Layer)

```typescript
// API routes (Next.js API routes or Express)

// Chat
POST /api/chat          { prompt: string, sessionId?: string } → SSE stream of agent events
GET  /api/sessions      → SessionInfo[]
GET  /api/sessions/:id  → SessionInfo + messages

// Memory
GET  /api/memory/board   → KanbanBoard
POST /api/memory/store   { content, type, entityName? } → Fact
GET  /api/memory/search  ?q=query → SearchResult[]

// Knowledge Base
GET  /api/kb/containers  → Container[]
GET  /api/kb/entities    → Entity[]
GET  /api/kb/facts       ?containerId=&entityId= → Fact[]
GET  /api/kb/skills      → Skill[]

// Agent Management
GET  /api/agents         → AgentIdentity[]
POST /api/agents         { identity config } → AgentIdentity
PUT  /api/agents/:id     { updates } → AgentIdentity

// Onboarding
POST /api/onboarding/profile  { answers } → void (stores facts)
POST /api/onboarding/agent    { identityId, tools, config } → AgentConfig
```

### WebSocket for Streaming

```typescript
// WebSocket at /ws/chat
// Client sends: { type: 'prompt', prompt: string, sessionId?: string }
// Server sends: { type: 'token', content: string }
//               { type: 'tool_use', name: string, input: unknown }
//               { type: 'tool_result', name: string, result: unknown }
//               { type: 'done', sessionId: string }
```

### Design System Integration

The Aura Obsidian design tokens from the UI spec should be implemented as:
- CSS custom properties (for the color/spacing/radius tokens)
- Tailwind CSS config (if using Tailwind)
- Component library matching the spec's component definitions

Key design rules to enforce:
- No-line boundary rule (surface color shifts, not borders)
- Glassmorphism for floating elements
- Manrope for headlines, Inter for body, JetBrains Mono for code

---

## 6.3 Voice Input

### Architecture

```
Audio (microphone or Telegram voice note)
   ↓
Local Whisper (faster-whisper on 3080)
   ↓
Text transcript
   ↓
Agent (as normal text prompt)
```

### Key Interface

```typescript
interface TranscriptionProvider {
  transcribe(audio: Buffer, format: 'ogg' | 'wav' | 'mp3'): Promise<string>;
}

function createWhisperProvider(config?: { modelSize?: 'tiny' | 'base' | 'small' | 'medium' | 'large' }): TranscriptionProvider
```

### Implementation Notes

- Use `faster-whisper` (Python) via subprocess or HTTP server
- Or use `whisper.cpp` with Node.js bindings
- GPU acceleration on RTX 3080 for real-time transcription
- Telegram voice notes: download OGG, convert to WAV, transcribe
- Web GUI: use browser's MediaRecorder API, send audio to server

### Deferred Details

Voice output (TTS) is not in scope. Design the audio message protocol in the gateway to support future TTS integration.

---

## Acceptance Criteria

- [ ] Telegram bot responds to messages from allowlisted users
- [ ] Telegram messages route through gateway to agent with full memory access
- [ ] Working memory visible via Telegram `/tasks` command
- [ ] Web GUI serves onboarding wizard with Aura Obsidian design
- [ ] Web chat interface with streaming responses
- [ ] Agent builder canvas with identity/tool/context decks
- [ ] Memory Palace browser shows PARA containers, entities, facts, skills
- [ ] Voice notes transcribed via local Whisper and processed as text prompts
- [ ] All surfaces share the same memory DB

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Telegram Bot API rate limits | Queue messages, respect 30msg/s limit. Batch long responses |
| Web GUI is a significant frontend effort | Start with chat + onboarding only. Memory Palace and full agent builder as v2 |
| WebSocket connection management (reconnection, state sync) | Use established patterns (socket.io or similar). Reconnect with session resume |
| Whisper transcription quality on noisy audio | Use `medium` model by default (good quality/speed tradeoff on 3080). Allow model size config |
| Aura Obsidian design system is complex to implement | Start with core tokens (colors, typography, spacing). Component library incrementally |
