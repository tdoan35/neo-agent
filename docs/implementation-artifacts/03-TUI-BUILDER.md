# Phase 3: TUI + Agent Builder + Cron

## Overview

Terminal user interface for interacting with the agent, onboarding wizard for first-time setup, simplified agent builder for identity/tool selection, and the cron scheduler for automated jobs (including Pipeline 2 triggers).

**Estimated effort**: 5-7 days

---

## Prerequisites

- Phase 2 complete (gateway running, agent sessions functional, hooks operational)
- TUI framework decision: **Ink** (React for terminal) is recommended
  - Install: `ink`, `ink-text-input`, `ink-spinner`, `react` (Ink's peer dep)
  - Alternative: raw ANSI via `chalk` + `readline` (simpler but less maintainable)

---

## Dependency Graph

```
packages/tui/
  src/
    app.tsx                    (main Ink app)
    components/
      ChatView.tsx             (message list + input)
      MessageBubble.tsx        (user/agent message rendering)
      StatusBar.tsx             (current task, memory status, model)
      Sidebar.tsx              (conversation list — future, stub for now)
      ToolIndicator.tsx        (shows tool usage inline)
    commands/
      handler.ts               (slash command dispatcher)
    onboarding/
      Wizard.tsx               (multi-step onboarding flow)
      ProfileQuestions.tsx
      AgentPicker.tsx
    index.ts                   (entry point: connect to gateway, render app)

packages/gateway/
  src/
    cron/
      scheduler.ts             (cron job execution engine)
      builtin-jobs.ts          (dream trigger, session count check)
    channels/
      tui-adapter.ts           (bidirectional comms with TUI process)
    heartbeat.ts               (periodic memory refresh)
```

---

## Implementation Units

### 3.1 TUI Framework Setup

#### Files

- `packages/tui/src/index.ts` — Entry point
- `packages/tui/src/app.tsx` — Root Ink component

#### Key Interface

```typescript
// Entry point
async function startTUI(options?: { gatewayUrl?: string }): Promise<void>

// Connects to gateway, starts Ink render loop
```

#### Implementation Notes

- TUI is a separate process that connects to the running gateway daemon
- Communication: in-process function calls (for MVP), or WebSocket (for decoupled deployment later)
- For MVP: TUI can directly import gateway and agent packages, starting everything in one process:

```typescript
import { startGateway } from '@neo-agent/gateway';
import { startAgentSession } from '@neo-agent/agent';
import { render } from 'ink';
import { App } from './app.js';

async function startTUI() {
  const gateway = await startGateway();
  render(<App gateway={gateway} />);
}
```

---

### 3.2 Chat Interface

#### Files

- `packages/tui/src/components/ChatView.tsx`
- `packages/tui/src/components/MessageBubble.tsx`
- `packages/tui/src/components/ToolIndicator.tsx`

#### Implementation Notes

**ChatView** manages:
- Message history (array of `{ role, content, tools? }`)
- User input (multiline text input with Enter to send, Shift+Enter for newline)
- Streaming response display (token-by-token as the agent generates)
- Auto-scroll to bottom

**Message rendering:**
- User messages: plain text, right-indicated
- Agent messages: rendered markdown (bold, code blocks, lists)
- Tool indicators: inline pills showing "Used: Read src/auth.ts" below agent messages
- Use `ink-markdown` or simple regex-based markdown rendering

**Streaming:**
```typescript
for await (const message of agentSession.query) {
  if (message.type === 'stream_event') {
    // Append token to current message
  } else if (message.type === 'assistant') {
    // Complete message
  } else if (message.type === 'result') {
    // Turn complete
  }
}
```

---

### 3.3 Status Bar

#### Files

- `packages/tui/src/components/StatusBar.tsx`

#### Implementation Notes

Bottom of terminal, shows:
- Current active task (if any): "Working on: Fix token expiry bug"
- Memory status: "Memory: Active" (green) or "Memory: Disconnected" (red)
- Model: "Claude Opus 4.6"
- Agent name: "Dana"

Update on heartbeat and after each tool use.

---

### 3.4 Slash Commands

#### Files

- `packages/tui/src/commands/handler.ts`

#### Supported Commands

| Command | Action |
|---------|--------|
| `/new` | Start a new conversation session |
| `/model [name]` | Switch model |
| `/dream` | Trigger batch pipeline (calls `memory_dream` MCP tool) |
| `/status` | Show gateway status, session count, memory stats |
| `/tasks` | Show working memory kanban board |
| `/tasks add [title]` | Add a new task to backlog |
| `/tasks done [id]` | Mark task as done |
| `/agent` | Show current agent info |
| `/agent list` | List available agent identities |
| `/agent switch [name]` | Switch to a different agent identity |
| `/cron` | List cron jobs |
| `/cron add [schedule] [prompt]` | Add a cron job |
| `/doctor` | Run diagnostics |
| `/quit` | Exit TUI |

#### Implementation

```typescript
function handleCommand(input: string, context: CommandContext): Promise<string | void> {
  const [cmd, ...args] = input.slice(1).split(' ');
  switch (cmd) {
    case 'dream': return triggerDream(context);
    case 'tasks': return handleTasks(args, context);
    case 'agent': return handleAgent(args, context);
    // ...
  }
}
```

Commands that start with `/` are intercepted before being sent to the agent.

---

### 3.5 Onboarding Wizard

#### Files

- `packages/tui/src/onboarding/Wizard.tsx`
- `packages/tui/src/onboarding/ProfileQuestions.tsx`
- `packages/tui/src/onboarding/AgentPicker.tsx`

#### Trigger

First-run detection: check if any `biographical` facts exist in the global KB with the user entity.

```typescript
const userFacts = await listFacts(db, { scope: 'global', type: 'biographical' });
if (userFacts.length === 0) {
  // Run onboarding wizard
}
```

#### Step 1: User Profile

Sequential prompts (not form cards — TUI can't do visual cards):

1. "What's your name?" → text input
2. "What do you do?" → text input
3. "What will you primarily use this for?" → numbered list selection (Coding, PM, Research, Writing, Productivity)
4. "How do you prefer communication? (1) Concise (2) Detailed" → selection
5. "What tools do you use daily?" → comma-separated list

Store each answer as a global-scoped `biographical` or `preference` fact linked to a "User" entity.

#### Step 2: Agent Selection

Text-based identity picker:

```
Choose your assistant's personality:

  1. Dana — Executive Assistant, Stern & Direct
     "I'll keep you accountable and organized. No sugar-coating."

  2. Carlos — Executive Assistant, Short & Professional
     "Action items and status updates. Let's be efficient."

  3. Yuki — Executive Assistant, Quick & Witty
     "I'll keep things moving with a smile. Mostly."

  4. Custom — Build your own

Enter number (1-4):
```

Selection loads the corresponding SOUL.md preset and creates an identity record.

#### Step 3: Confirmation + First Conversation

Save the agent config, then start a normal chat session. The agent introduces itself in character using its SOUL.md personality.

---

### 3.6 Identity Presets

#### Files

- `config/identities/dana.md`
- `config/identities/carlos.md`
- `config/identities/yuki.md`
- `config/identities/aria.md`

#### Implementation Notes

Each preset is a SOUL.md file following the template from ARCHITECTURE.md §5.1.

On first selection, the SOUL.md content is:
1. Copied to `~/.agent/souls/{name}.md`
2. An identity record created in the `identities` table

The agent builder's "Custom" option opens `$EDITOR` with a SOUL.md template for the user to fill in.

---

### 3.7 Cron Scheduler

#### Files

- `packages/gateway/src/cron/scheduler.ts`
- `packages/gateway/src/cron/builtin-jobs.ts`

#### Key Interface

```typescript
interface CronScheduler {
  start(): void;
  stop(): void;
  addJob(job: CronJobInput): Promise<CronJob>;
  removeJob(id: string): Promise<void>;
  enableJob(id: string): Promise<void>;
  disableJob(id: string): Promise<void>;
  listJobs(): Promise<CronJob[]>;
  getNextRun(id: string): Date | null;
}

function createCronScheduler(db: DrizzleDB, gateway: Gateway): CronScheduler;
```

#### Implementation Notes

- Use `node-cron` or `croner` for cron expression parsing and scheduling
- Jobs stored in `cron_jobs` table (from schema)
- When a job fires:
  1. Create a new agent session with the job's `prompt`
  2. Run the prompt through the agent (agent sees its working memory, KB, etc.)
  3. Capture the output
  4. Deliver to the specified channel (TUI notification for now)
  5. Update `last_run_at` and calculate `next_run_at`

#### Built-in Jobs

```typescript
// Nightly dream trigger
{
  name: 'nightly-dream',
  schedule: '0 2 * * *',  // 2:00 AM daily
  prompt: '[SYSTEM] Run batch memory consolidation pipeline',
  agentId: 'system',
  deliverTo: 'log',  // No user notification
  enabled: true,
}

// Session count check (every hour)
{
  name: 'session-count-check',
  schedule: '0 * * * *',  // Every hour
  prompt: '[SYSTEM] Check if session count threshold reached for dream processing',
  agentId: 'system',
  deliverTo: 'log',
  enabled: true,
}
```

The session count check queries unprocessed session count. If > threshold (default 5), triggers the dream pipeline.

---

### 3.8 Heartbeat

#### Files

- `packages/gateway/src/heartbeat.ts`

#### Key Interface

```typescript
interface HeartbeatConfig {
  intervalMs: number;  // default: 600000 (10 minutes)
  onRefresh: (board: KanbanBoard) => void;
}

function startHeartbeat(db: DrizzleDB, agentId: string, config: HeartbeatConfig): { stop: () => void }
```

#### Implementation Notes

Every interval:
1. Refresh working memory from DB (pick up changes from other surfaces or cron jobs)
2. Check for completed background processes → fire callbacks
3. Optionally trigger PerPrompt retrieval refresh if session is active

Uses `setInterval` — nothing fancy needed.

---

## Test Strategy

### Test Files

- `packages/tui/tests/commands.test.ts`
- `packages/tui/tests/onboarding.test.ts`
- `packages/gateway/tests/cron/scheduler.test.ts`
- `packages/gateway/tests/heartbeat.test.ts`

### Key Test Cases

**Commands:**
- `/tasks` returns formatted kanban board
- `/dream` triggers batch pipeline
- `/agent list` shows available identities
- Unknown command returns error message

**Onboarding:**
- First-run detection: empty KB → wizard triggers
- After onboarding: facts stored in global scope
- Identity record created for selected preset

**Cron:**
- Add job → stored in DB, appears in `listJobs()`
- Job fires at scheduled time (use short interval for test, e.g., every second)
- Disable job → stops firing
- Enable job → resumes

**Heartbeat:**
- Working memory refreshes on interval
- Callback fires on refresh

---

## Acceptance Criteria

- [ ] TUI launches, connects to gateway, renders chat interface
- [ ] Can have a conversation with Claude via TUI
- [ ] Streaming responses display token-by-token
- [ ] Status bar shows current task, memory status, model, agent name
- [ ] All slash commands work
- [ ] Onboarding wizard runs on first launch, seeds user profile
- [ ] Identity presets available (Dana, Carlos, Yuki, Aria)
- [ ] Agent switch via `/agent switch` works (new identity, same memory)
- [ ] Cron scheduler runs jobs on schedule
- [ ] Built-in dream trigger fires at 2am (or manually via `/dream`)
- [ ] Heartbeat refreshes working memory periodically
- [ ] All tests pass

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Ink has limited markdown rendering support | Use `ink-markdown` package or implement basic markdown (bold, code blocks, lists) with chalk |
| TUI multiline input is tricky | Use `ink-text-input` with custom key handling. Accept Shift+Enter for newline, Enter to send |
| Cron jobs running agent sessions creates multiple concurrent sessions | Each cron job gets its own session. Memory DB handles concurrent reads (WAL mode). Writes are serialized by SQLite |
| TUI ↔ gateway communication model not finalized | MVP: same process. Later: WebSocket or Unix socket. Design the interface now, change transport later |
