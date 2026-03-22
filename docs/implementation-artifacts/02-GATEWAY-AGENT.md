# Phase 2: Gateway Daemon + Primary Agent

## Overview

The gateway daemon is the persistent backbone — a long-lived Node.js process that hosts the MCP memory server, cron scheduler, process manager, and channel adapters. The primary agent integrates with the Agent SDK, wiring the 6 memory-critical hooks that form Pipeline 1 (real-time extraction).

**Estimated effort**: 5-7 days

---

## Prerequisites

- Phase 1 complete (all sub-phases: schema, store, retrieval, MCP server)
- `@anthropic-ai/claude-agent-sdk ^0.2.81` installed
- Ollama running with `qwen3:8b` (for end-of-turn extraction) and `nomic-embed-text`

---

## Dependency Graph

```
packages/gateway/
  src/
    daemon.ts              (process lifecycle, PID file, signals)
    health.ts              (HTTP health check endpoint)
    doctor.ts              (configuration validator)
    process-mgr/
      manager.ts           (spawn, monitor, kill child processes)
    index.ts

packages/agent/
  src/
    primary/
      claude-agent.ts      (Agent SDK query() wrapper)
      auth.ts              (Max subscription / API key auth)
    hooks/
      session-start.ts     (load working memory + KB)
      user-prompt.ts       (per-prompt semantic retrieval)
      post-tool-use.ts     (session logging + rule-based extraction)
      pre-compact.ts       (snapshot working memory)
      post-compact.ts      (re-inject working memory + KB)
      stop.ts              (end-of-turn LLM extraction)
      index.ts             (hook registration)
    identity/
      soul.ts              (SOUL.md loader)
    index.ts

Build order:
  gateway/daemon.ts → gateway/process-mgr → gateway/health → gateway/doctor
  agent/hooks/* (parallel) → agent/primary/claude-agent.ts → agent/index.ts
  Wire gateway + agent together
```

---

## Implementation Units

### 2.1 Gateway Daemon

#### Files

- `packages/gateway/src/daemon.ts`

#### Key Interface

```typescript
interface GatewayConfig {
  dbPath: string;              // default: '~/.agent/memory.db'
  ollamaUrl: string;           // default: 'http://localhost:11434'
  healthPort: number;          // default: 7832
  pidFile: string;             // default: '~/.agent/gateway.pid'
}

async function startGateway(config?: Partial<GatewayConfig>): Promise<Gateway>

interface Gateway {
  db: DrizzleDB;
  memoryServer: McpSdkServerConfigWithInstance;
  processManager: ProcessManager;
  embeddingProvider: EmbeddingProvider;
  shutdown(): Promise<void>;
}
```

#### Implementation Notes

**Startup sequence:**
1. Check PID file — if another gateway is running, exit with error
2. Write PID file (`process.pid`)
3. Initialize database (`createDatabase(config.dbPath)`)
4. Create embedding provider (`createOllamaEmbeddingProvider(config)`)
5. Create in-process MCP memory server
6. Initialize process manager
7. Start health check HTTP server
8. Log "Gateway started on PID {pid}"

**Shutdown sequence (SIGTERM/SIGINT handler):**
1. Stop accepting new connections
2. Wait for in-flight operations (with timeout)
3. Close database connection
4. Remove PID file
5. Exit cleanly

**PID file enforcement:**
```typescript
function checkPidFile(pidFile: string): boolean {
  if (!existsSync(pidFile)) return false;
  const pid = parseInt(readFileSync(pidFile, 'utf-8'));
  try {
    process.kill(pid, 0);  // Check if process is alive (signal 0)
    return true;  // Process exists
  } catch {
    unlinkSync(pidFile);  // Stale PID file
    return false;
  }
}
```

---

### 2.2 Health Check

#### Files

- `packages/gateway/src/health.ts`

#### Implementation Notes

Simple HTTP server on configurable port (default 7832):

```
GET /health → 200 { "status": "ok", "uptime": 12345, "db": "connected", "ollama": "connected" | "disconnected" }
GET /status → 200 { "activeSessions": 0, "processesRunning": 1, "memoryStats": { "facts": 42, "entities": 12 } }
```

Uses Node.js built-in `http.createServer` — no Express dependency needed for two routes.

---

### 2.3 Doctor Command

#### Files

- `packages/gateway/src/doctor.ts`

#### Key Interface

```typescript
interface DiagnosticResult {
  check: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

async function runDiagnostics(config: GatewayConfig): Promise<DiagnosticResult[]>
```

#### Checks

1. **Node version**: ≥ 22 → ok
2. **Database**: can open and query → ok
3. **Ollama**: reachable at configured URL → ok / warn if unreachable
4. **nomic-embed-text model**: available in Ollama → ok / warn
5. **qwen3:8b model**: available in Ollama → ok / warn
6. **PID file**: no stale PID file → ok
7. **Disk space**: > 1GB free on DB partition → ok / warn
8. **Agent SDK**: can import → ok

---

### 2.4 Process Manager

#### Files

- `packages/gateway/src/process-mgr/manager.ts`

#### Key Interface

```typescript
interface ManagedProcess {
  id: string;
  command: string;
  args: string[];
  pid: number;
  status: 'running' | 'completed' | 'failed' | 'killed';
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt: string;
  completedAt: string | null;
}

class ProcessManager {
  spawn(command: string, args: string[], options?: { cwd?: string; env?: Record<string, string> }): ManagedProcess;
  getProcess(id: string): ManagedProcess | undefined;
  listProcesses(status?: ManagedProcess['status']): ManagedProcess[];
  kill(id: string): void;
  onComplete(id: string, callback: (process: ManagedProcess) => void): void;
}
```

#### Implementation Notes

- Uses `child_process.spawn` with piped stdout/stderr
- Buffers stdout/stderr in memory (with configurable max buffer size, default 1MB)
- Emits completion callbacks when child process exits
- Tracks all processes by ID for status queries
- Kill sends SIGTERM, then SIGKILL after 5s timeout

---

### 2.5 Agent SDK Integration

#### Files

- `packages/agent/src/primary/claude-agent.ts`
- `packages/agent/src/primary/auth.ts`

#### Key Interface

```typescript
interface AgentSession {
  query: Query;  // The AsyncGenerator from Agent SDK
  sessionId: string;
  agentId: string;
}

interface AgentConfig {
  gateway: Gateway;
  identity: AgentIdentity;        // From identities store
  systemPrompt: string;           // Assembled from SOUL.md + memory instructions
  model?: string;                 // default: let SDK pick
  permissionMode?: PermissionMode;
}

async function startAgentSession(
  config: AgentConfig,
  prompt: string | AsyncIterable<SDKUserMessage>
): Promise<AgentSession>
```

#### Implementation Notes

```typescript
import { query } from '@anthropic-ai/claude-agent-sdk';

async function startAgentSession(config: AgentConfig, prompt: string | AsyncIterable<SDKUserMessage>) {
  const hooks = createHookPipeline(config.gateway);

  const q = query({
    prompt,
    options: {
      model: config.model,
      permissionMode: config.permissionMode ?? 'default',
      mcpServers: {
        'memory': config.gateway.memoryServer,
      },
      hooks,
      // System prompt via agent definition or initial context
    },
  });

  return { query: q, sessionId: '...', agentId: config.identity.id };
}
```

**Auth handling:**
- Primary: Claude Max subscription via OAuth token (from `CLAUDE_CODE_OAUTH_TOKEN` env var)
- The Agent SDK handles auth internally — it uses the same auth mechanism as Claude Code
- Fallback: API key via `ANTHROPIC_API_KEY` env var

---

### 2.6 Hook Pipeline (Pipeline 1 — The Critical Integration)

#### Files

All under `packages/agent/src/hooks/`:

| File | Hook Event | Sync/Async | Key Output |
|------|-----------|------------|------------|
| `session-start.ts` | `SessionStart` | Sync | `additionalContext` |
| `user-prompt.ts` | `UserPromptSubmit` | Sync | `additionalContext` |
| `post-tool-use.ts` | `PostToolUse` | Async | Session log + WM update |
| `pre-compact.ts` | `PreCompact` | Sync | Snapshot to DB |
| `post-compact.ts` | `PostCompact` | Sync | `additionalContext` (re-inject) |
| `stop.ts` | `Stop` | Async | LLM extraction + flush |
| `index.ts` | — | — | Hook registration object |

#### Hook Registration

```typescript
// packages/agent/src/hooks/index.ts

import type { HookEvent, HookCallbackMatcher } from '@anthropic-ai/claude-agent-sdk';

function createHookPipeline(gateway: Gateway): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  return {
    SessionStart: [{ hooks: [createSessionStartHook(gateway)] }],
    UserPromptSubmit: [{ hooks: [createUserPromptHook(gateway)] }],
    PostToolUse: [{ hooks: [createPostToolUseHook(gateway)] }],
    PreCompact: [{ hooks: [createPreCompactHook(gateway)] }],
    PostCompact: [{ hooks: [createPostCompactHook(gateway)] }],
    Stop: [{ hooks: [createStopHook(gateway)] }],
  };
}
```

---

#### 2.6.1 SessionStart Hook

**When**: Session starts (source: 'startup', 'resume', 'clear', 'compact')

**Type signature:**
```typescript
function createSessionStartHook(gateway: Gateway): HookCallback
// (input: SessionStartHookInput, toolUseID: undefined, options: { signal: AbortSignal }) => Promise<SyncHookJSONOutput>
```

**Logic:**
1. Determine `agentId` from `input.agent_id` or default
2. Call `assembleContext(db, provider, agentId, projectId, '', { mode: 'SessionStart' })`
3. Return:
```typescript
{
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext: assembledContext,
  }
}
```

**Notes:**
- On `source: 'compact'`, this is actually the PostCompact flow — but the SDK fires SessionStart after compaction too. Check the source to decide mode.
- The `additionalContext` string is injected into the system prompt by the SDK.

---

#### 2.6.2 UserPromptSubmit Hook

**When**: Every time the user sends a message.

**Type signature:**
```typescript
function createUserPromptHook(gateway: Gateway): HookCallback
// (input: UserPromptSubmitHookInput, ...) => Promise<SyncHookJSONOutput>
```

**Logic:**
1. Use `input.prompt` as the query
2. Call `assembleContext(db, provider, agentId, projectId, input.prompt, { mode: 'PerPrompt' })`
3. Return:
```typescript
{
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: perPromptContext,
  }
}
```

**Notes:**
- Only assembles blocks 4-5 (relevant knowledge + skills) to avoid redundancy with SessionStart
- Must be fast — runs synchronously before the model sees the prompt

---

#### 2.6.3 PostToolUse Hook

**When**: After every tool invocation completes.

**Type signature:**
```typescript
function createPostToolUseHook(gateway: Gateway): HookCallback
// (input: PostToolUseHookInput, toolUseID: string, ...) => Promise<HookJSONOutput>
```

**Logic:**
1. Log the tool call to session logs:
```typescript
appendLog(db, {
  sessionId: input.session_id,
  agentId: input.agent_id ?? 'default',
  turnIndex: currentTurnIndex,
  role: 'tool',
  content: JSON.stringify({ tool: input.tool_name, input: input.tool_input, response: summarize(input.tool_response) }),
  toolName: input.tool_name,
  toolInput: JSON.stringify(input.tool_input),
});
```

2. Rule-based extraction based on tool name:

| Tool | Extraction |
|------|------------|
| `Write` / `Edit` | Log file path + change summary → update active task context |
| `Bash` | Log command + exit code. If error, log error message |
| `WebSearch` | Log query + result count |
| `Read` | Log file path (track what agent is examining) |

3. Update working memory if relevant (e.g., file paths added to active task context)

4. Return `{ async: true }` (non-blocking — session logging shouldn't slow the agent)

**Notes:**
- The `tool_response` can be very large (e.g., file contents from Read). Summarize/truncate before logging.
- This hook fires frequently — keep it lightweight.

---

#### 2.6.4 PreCompact Hook

**When**: Just before context compaction occurs (manual or auto).

**Type signature:**
```typescript
function createPreCompactHook(gateway: Gateway): HookCallback
// (input: PreCompactHookInput, ...) => Promise<SyncHookJSONOutput>
```

**Logic:**
1. Get the current kanban board for this agent
2. Ensure all active/blocked tasks are fully persisted to DB (flush any in-memory state)
3. Persist any buffered session log entries
4. Return `{ continue: true }` (allow compaction to proceed)

**Notes:**
- This is the critical "save before compress" step that prevents compaction amnesia
- No `additionalContext` needed here — PostCompact handles re-injection

---

#### 2.6.5 PostCompact Hook

**When**: After compaction completes.

**Input includes:** `compact_summary` (string) — the compaction summary produced by the SDK.

**Type signature:**
```typescript
function createPostCompactHook(gateway: Gateway): HookCallback
// (input: PostCompactHookInput, ...) => Promise<SyncHookJSONOutput>
```

**Logic:**
1. Full context reassembly: `assembleContext(db, provider, agentId, projectId, '', { mode: 'PostCompact' })`
2. Prepend compaction note: "Context was compacted. Working memory and knowledge base have been re-injected."
3. Return:
```typescript
{
  hookSpecificOutput: {
    hookEventName: 'PostCompact',  // Note: PostCompact doesn't have its own specific output type
    additionalContext: fullContext,
  }
}
```

**Important SDK note:** Check if `PostCompact` has a `hookSpecificOutput` type with `additionalContext`. Looking at the SDK types, `SyncHookJSONOutput.hookSpecificOutput` is a union — verify `PostCompact` is included. If not, use the `systemMessage` field on `SyncHookJSONOutput` instead:

```typescript
{
  systemMessage: fullContext,
}
```

---

#### 2.6.6 Stop Hook

**When**: The agent finishes its turn (stops generating).

**Type signature:**
```typescript
function createStopHook(gateway: Gateway): HookCallback
// (input: StopHookInput, ...) => Promise<HookJSONOutput>
```

**Logic:**
1. Get `input.last_assistant_message` (the agent's final response)
2. Get the last few session log entries for this session
3. Call local Ollama (qwen3:8b) for end-of-turn extraction:

```typescript
const extractionPrompt = `Given this conversation turn, extract:
1. Any decisions made (type: decision)
2. Any user preferences stated (type: preference)
3. Any task state changes (completed, blocked, new task)
4. Any new entities mentioned (people, tools, services)

Conversation:
${input.last_assistant_message}

Return as JSON array of { type, content, entityName?, confidence }`;

// Call Ollama via Vercel AI SDK or raw HTTP
const result = await callOllama('qwen3:8b', extractionPrompt);
```

4. Parse the extraction result and store each item:
   - Decisions/preferences → `createFact(db, ...)`
   - Task state changes → `transitionTask(db, ...)`
   - New entities → `createEntity(db, ...)`
5. Generate embeddings for new facts
6. Flush any remaining session log entries

7. Return `{ async: true }` (non-blocking)

**Notes:**
- This is the most expensive hook — it calls a local LLM. Must be async.
- If `last_assistant_message` is empty or very short, skip extraction
- Extraction quality depends on the local model. qwen3:8b is a good balance of quality and speed.
- Use `input.stop_hook_active` to avoid re-entrancy (if stop hook triggers another stop)

---

### 2.7 SOUL.md Loader

#### Files

- `packages/agent/src/identity/soul.ts`

#### Key Interface

```typescript
function loadSoulFile(path: string): Promise<string>
// Reads the SOUL.md file and returns its content as the system prompt fragment

function assembleSytemPrompt(identity: AgentIdentity, memoryInstructions: string): string
// Combines SOUL.md content with memory tool instructions
```

#### Memory Instructions Template

```markdown
## Memory Tools

You have access to a persistent memory system via MCP tools:

- **memory_recall**: Retrieve relevant context for your current task
- **memory_store**: Save important facts, decisions, or observations
- **memory_search**: Search the knowledge base
- **memory_working_state**: View and manage your task board
- **memory_handoff**: Save a session summary for continuity
- **memory_dream**: Trigger deep memory consolidation

Your working memory (active tasks) is automatically loaded at session start.
Relevant knowledge is automatically retrieved based on the conversation.
Use memory_store to explicitly save things you want to remember long-term.
```

---

## Test Strategy

### Test Files

- `packages/gateway/tests/daemon.test.ts`
- `packages/gateway/tests/process-mgr.test.ts`
- `packages/gateway/tests/doctor.test.ts`
- `packages/agent/tests/hooks/session-start.test.ts`
- `packages/agent/tests/hooks/user-prompt.test.ts`
- `packages/agent/tests/hooks/post-tool-use.test.ts`
- `packages/agent/tests/hooks/pre-compact.test.ts`
- `packages/agent/tests/hooks/post-compact.test.ts`
- `packages/agent/tests/hooks/stop.test.ts`

### Key Test Cases

**Gateway daemon:**
- Starts, creates PID file, health check responds
- Graceful shutdown removes PID file
- Rejects start if PID file exists and process is alive

**Process manager:**
- Spawn `echo hello` → status = completed, stdout = "hello\n"
- Kill running process → status = killed
- onComplete callback fires

**Doctor:**
- All checks pass with valid config
- Reports warn for missing Ollama

**Hooks** (test each hook in isolation with mocked gateway):
- SessionStart: returns `additionalContext` with all 5 blocks
- UserPromptSubmit: returns `additionalContext` with blocks 4-5
- PostToolUse: session log entry created with correct tool info
- PreCompact: working memory tasks persisted
- PostCompact: full context re-assembled and returned
- Stop: extraction prompt sent, results stored as facts (mock the LLM call)

### Integration Test

End-to-end test (requires Agent SDK + Claude access):
- Start gateway
- Start agent session with a simple prompt
- Verify SessionStart hook fired (check DB for session start context)
- Send a message, verify UserPromptSubmit hook fired
- Verify PostToolUse hooks fire when agent uses tools
- Verify Stop hook fires at end of turn

This is a manual/CI integration test, not a unit test. Gate behind env var.

---

## Acceptance Criteria

- [ ] Gateway daemon starts, writes PID file, responds to health checks
- [ ] Graceful shutdown on SIGTERM/SIGINT
- [ ] PID file prevents duplicate instances
- [ ] Doctor validates configuration
- [ ] Process manager spawns, monitors, and kills processes
- [ ] All 6 hooks fire at correct points
- [ ] SessionStart injects full context (all 5 blocks)
- [ ] UserPromptSubmit injects per-prompt retrieval (blocks 4-5)
- [ ] PostToolUse logs to session_logs + extracts rule-based facts
- [ ] PreCompact snapshots working memory to DB
- [ ] PostCompact re-injects full context after compaction
- [ ] Stop hook extracts facts via local LLM (async)
- [ ] Working memory survives compaction (the core value proposition)
- [ ] All tests pass

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `PostCompact` hook may not support `additionalContext` in `hookSpecificOutput` | Check SDK types. Fallback: use `systemMessage` field on `SyncHookJSONOutput` |
| Stop hook LLM extraction is slow (~2-5s on 3080 with qwen3:8b) | Must be async. Return `{ async: true }` immediately. Process extraction in background |
| Agent SDK auth via Max subscription may change | Support API key fallback via `ANTHROPIC_API_KEY` env var |
| Hook ordering: multiple hooks for same event may interfere | We register one hook per event. No ordering issues |
| `PostToolUse` fires on every tool call — high frequency | Keep handler fast. Use `{ async: true }` for session logging. Only synchronous part: check if tool name matches extraction rules |
| Compaction may fire mid-task, losing context | PreCompact snapshots everything. PostCompact rebuilds. This is the core architecture solving problem #1 |
