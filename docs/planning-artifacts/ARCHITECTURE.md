# Architecture Specification

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Gateway Daemon                                │
│  (persistent process: hosts all subsystems, manages lifecycle)       │
│                                                                      │
│  ┌──────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────────┐ │
│  │ Cron     │ │ Process      │ │ Channel    │ │ MCP Memory       │ │
│  │ Scheduler│ │ Manager      │ │ Adapters   │ │ Server           │ │
│  │          │ │              │ │ (TUI first)│ │ (stdio + HTTP)   │ │
│  └──────────┘ └──────────────┘ └────────────┘ └──────────────────┘ │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Primary Agent│ │ Secondary    │ │ Batch Pipeline│
│ (Agent SDK)  │ │ Agent        │ │ (Dream)       │
│ Claude Max   │ │ (Vercel AI)  │ │ Local Ollama  │
│ Full hooks   │ │ GLM/Ollama   │ │ or Claude     │
└──────┬───────┘ └──────┬───────┘ └──────┬───────┘
       │                │                │
       └────────────────┼────────────────┘
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Memory Layer (the product)                        │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ Working      │ │ Knowledge    │ │ Session      │                │
│  │ Memory       │ │ Base         │ │ Logs         │                │
│  │ (Kanban)     │ │ (PARA × KB)  │ │ (Episodic)   │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ Retrieval    │ │ Extraction   │ │ Embeddings   │                │
│  │ Engine       │ │ Engine       │ │ (sqlite-vec) │                │
│  └──────────────┘ └──────────────┘ └──────────────┘                │
│                                                                      │
│                  SQLite + Drizzle ORM + FTS5                        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 1. Memory Layer

### 1.1 Database: SQLite + Drizzle

Single file: `~/.agent/memory.db`

All tables use Drizzle ORM with typed schemas. Migrations managed by `drizzle-kit`.

### 1.2 PARA Containers

Top-level organizational units. Every piece of knowledge lives inside a container.

```typescript
// containers table
{
  id: string (uuid)
  paraType: 'project' | 'area' | 'resource' | 'archive'
  name: string                    // "Personal AI Assistant Build"
  description: string | null
  outcome: string | null          // For projects: defined outcome
  deadline: string | null         // ISO date, null for areas/resources
  status: 'active' | 'paused' | 'completed' | 'archived'
  areaOfLife: string | null       // For areas: career, health, etc.
  parentId: string | null         // FK → containers (nesting)
  scope: 'private' | 'team' | 'global'
  ownerAgent: string | null
  createdAt: string (ISO)
  updatedAt: string (ISO)
  archivedAt: string | null
}
```

### 1.3 Entities (Knowledge Graph Nodes)

```typescript
// entities table
{
  id: string (uuid)
  type: 'person' | 'project' | 'tool' | 'service' | 'concept' |
        'codebase' | 'organization' | 'device' | 'account' |
        'language' | 'framework'
  name: string                    // "Alice Chen"
  aliases: string (JSON array)    // ["Alice", "the frontend lead"]
  description: string | null
  containerId: string | null      // FK → containers (primary home)
  scope: 'private' | 'team' | 'global'
  projectId: string | null
  ownerAgent: string | null
  sourceSessionId: string | null
  createdAt: string (ISO)
  updatedAt: string (ISO)
  lastAccessedAt: string | null
  confidence: number (0.0 - 1.0)
}
```

### 1.4 Facts (Knowledge Graph Claims)

```typescript
// facts table
{
  id: string (uuid)
  entityId: string | null         // FK → entities (null = standalone)
  containerId: string | null      // FK → containers
  type: 'preference' | 'decision' | 'convention' | 'status' |
        'capability' | 'biographical' | 'environmental' |
        'observation' | 'lesson_learned' | 'goal' | 'blocker'
  content: string                 // "Prefers pnpm over yarn"
  structured: string | null       // JSON: { "key": "pkg_mgr", "value": "pnpm" }
  scope: 'private' | 'team' | 'global'
  projectId: string | null
  ownerAgent: string | null
  sourceSessionId: string | null
  sourceType: 'stated' | 'extracted' | 'inferred' | 'promoted'
  extractedBy: string | null      // "rule_engine" | "haiku" | "batch_nightly"
  createdAt: string (ISO)
  updatedAt: string (ISO)
  lastConfirmedAt: string | null
  lastAccessedAt: string | null
  expiresAt: string | null
  confidence: number (0.0 - 1.0)
  decayRate: number               // Per-day, 0 = never decays
  supersedesFactId: string | null // FK → facts
}
```

### 1.5 Relations (Knowledge Graph Edges)

```typescript
// relations table
{
  id: string (uuid)
  sourceEntityId: string          // FK → entities
  targetEntityId: string          // FK → entities
  type: 'works_on' | 'uses' | 'owns' | 'created_by' | 'depends_on' |
        'replaces' | 'related_to' | 'part_of' | 'collaborates_with' |
        'deployed_on' | 'integrates_with'
  label: string | null            // "since March 2026"
  directional: boolean (default true)
  scope: 'private' | 'team' | 'global'
  projectId: string | null
  createdAt: string (ISO)
  updatedAt: string (ISO)
  confidence: number (0.0 - 1.0)
}
```

### 1.6 Entity-Container Links (Many-to-Many)

```typescript
// entity_containers table
{
  id: string (uuid)
  entityId: string                // FK → entities
  containerId: string             // FK → containers
  role: string | null             // "primary_tool" | "dependency" | "reference"
  addedAt: string (ISO)
}
```

### 1.7 Working Memory (Kanban)

```typescript
// working_memory table
{
  id: string (uuid)
  agentId: string
  projectId: string | null
  title: string                   // "Fix token expiry bug in auth module"
  state: 'backlog' | 'active' | 'blocked' | 'done'
  context: string | null          // JSON: files, branches, relevant decisions
  decisions: string (JSON array)  // Array of decision objects
  blockers: string | null         // What's preventing progress
  openQuestions: string (JSON array)
  handoffSummary: string | null   // Human-readable for re-injection
  scope: 'private' | 'team'
  createdAt: string (ISO)
  updatedAt: string (ISO)
  completedAt: string | null
}
```

### 1.8 Session Logs (Episodic Memory)

```typescript
// session_logs table
{
  id: string (uuid)
  sessionId: string
  agentId: string
  projectId: string | null
  surface: 'tui' | 'web' | 'telegram' | 'discord' | null
  turnIndex: integer
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName: string | null
  toolInput: string | null (JSON)
  model: string | null
  tokenCount: integer | null
  createdAt: string (ISO)
  processed: boolean (default false)
  processedAt: string | null
  batchRunId: string | null
}
// FTS5 virtual table on session_logs(content) for full-text search
```

### 1.9 Skills (Procedural Memory Index)

```typescript
// skills table
{
  id: string (uuid)
  name: string
  description: string | null
  filePath: string                // ~/.agent/skills/deploy-atlas.md
  category: string | null         // devops, debugging, setup, workflow
  tags: string (JSON array)
  relatedEntityIds: string (JSON array)
  timesUsed: integer (default 0)
  lastUsedAt: string | null
  successRate: number | null (0.0 - 1.0)
  scope: 'private' | 'team' | 'global'
  projectId: string | null
  synthesizedFrom: string | null  // JSON array of session IDs
  createdAt: string (ISO)
  updatedAt: string (ISO)
  confidence: number (0.0 - 1.0)
}
```

### 1.10 Embeddings (sqlite-vec)

```typescript
// embeddings table
{
  id: string (uuid)
  sourceType: 'fact' | 'entity' | 'skill' | 'session_chunk'
  sourceId: string                // FK to source table
  vector: Float32Array            // sqlite-vec column
  textContent: string             // The text that was embedded
  createdAt: string (ISO)
}
```

### 1.11 Agent Identities

```typescript
// identities table
{
  id: string (uuid)
  name: string                    // "Dana"
  role: string                    // "Executive Assistant"
  tone: string                    // "Stern & Tough"
  avatar: string                  // JSON: { color: "#4a9eed", letter: "D" }
  persona: string                 // Long-form behavioral description
  boundaries: string (JSON array) // ["Never make decisions without asking"]
  soulPath: string                // Path to SOUL.md file
  isPreset: boolean
  createdFrom: string | null      // Which preset it was forked from
  createdAt: string (ISO)
  updatedAt: string (ISO)
}
```

### 1.12 Batch Runs (Dream Processing Metadata)

```typescript
// batch_runs table
{
  id: string (uuid)
  triggerType: 'cron' | 'session_count' | 'manual'
  status: 'running' | 'completed' | 'failed'
  sessionsProcessed: integer
  factsCreated: integer
  factsUpdated: integer
  factsArchived: integer
  entitiesCreated: integer
  skillsCreated: integer
  model: string                   // Which model ran the pipeline
  startedAt: string (ISO)
  completedAt: string | null
  error: string | null
}
```

---

## 2. Retrieval Engine

### 2.1 Context Assembly (per turn)

When a session starts or a new prompt arrives, assemble context:

```
1. Working Memory (always injected)
   - All tasks in 'active' state for this agent
   - Tasks in 'blocked' state (with blocker reasons)
   - Top 3 most recent 'backlog' tasks
   → Format as structured markdown block

2. User Profile (always injected)
   - Global-scoped biographical facts about the user
   - Top preferences by confidence
   → Format as "About the user" block

3. Project Context (if project is active)
   - Active PARA container's description + outcome
   - Team-scoped decisions and conventions for this project
   → Format as "Current project" block

4. Semantic Retrieval (per-prompt)
   - Embed the user's prompt
   - Query sqlite-vec for top-K similar facts/entities/skills
   - Filter by scope (global + team for current project + private for this agent)
   - Rank by: similarity × confidence × recency
   → Format as "Relevant knowledge" block

5. Skill Matching (per-prompt)
   - Query skills index for relevant procedures
   - Progressive disclosure: metadata first, full content if activated
   → Format as "Available procedures" block
```

### 2.2 Token Budget

Total injection budget: configurable, default ~2000 tokens
- Working memory: ~500 tokens (fixed)
- User profile: ~300 tokens (fixed)
- Project context: ~400 tokens (if active project)
- Semantic retrieval: ~600 tokens (variable, fill remaining budget)
- Skills: metadata only unless activated (~200 tokens)

### 2.3 Retrieval Modes

- **SessionStart**: Full assembly (all 5 blocks)
- **PostCompact**: Full assembly (rebuild after compaction)
- **PerPrompt**: Blocks 4-5 only (semantic + skills, refreshed each turn)
- **Heartbeat**: Block 1 only (refresh working memory)

---

## 3. Pipeline 1: Real-Time Extraction

### 3.1 Hook → Memory Mapping (Agent SDK)

| Hook Event | Memory Operation | Async? |
|------------|-----------------|--------|
| `SessionStart` | Load working memory + KB → inject via `additionalContext` | No |
| `UserPromptSubmit` | Run semantic retrieval against prompt → inject via `additionalContext` | No |
| `PreToolUse` | Log tool invocation to session log | Yes |
| `PostToolUse` | Log tool result to session log. Extract facts from tool output (rule-based). Update working memory if task-relevant. | Yes (extraction) |
| `PreCompact` | Snapshot working memory state. Persist any unsaved session log entries. | No |
| `PostCompact` | Re-inject working memory + KB facts via `additionalContext` | No |
| `Stop` | End-of-turn: summarize turn into key facts (cheap LLM). Update working memory task state. Flush session log. | Yes |
| `SubagentStart` | Create private working memory scope for subagent | No |
| `SubagentStop` | Promote relevant results from subagent to parent's working memory | Yes |

### 3.2 Rule-Based Extraction (PostToolUse)

For common tool outputs, extract facts without LLM:

| Tool | Extraction Rule |
|------|----------------|
| `Write` / `Edit` | Log file path + summary of change → working memory context |
| `Bash` | Log command + exit code. If error, log error message. |
| `WebSearch` | Log query + result count |
| `Read` | Log file path read (track what agent is looking at) |

### 3.3 LLM-Assisted Extraction (Stop hook)

At end of turn, call cheap local model with:
```
Given this conversation turn, extract:
1. Any decisions made (type: decision)
2. Any user preferences stated (type: preference)
3. Any task state changes (completed, blocked, new task)
4. Any new entities mentioned (people, tools, services)

Return as JSON array of { type, content, entityName?, confidence }
```

---

## 4. Pipeline 2: Batch "Dream" Processing

### 4.1 Trigger Conditions

Runs when ANY of:
- Cron schedule fires (default: 2:00 AM local time)
- Session count since last run exceeds threshold (default: 5)
- User manually runs `/dream`

### 4.2 Processing Stages

```
Stage 1: Episodic Replay
  - Read all unprocessed session logs (processed = false)
  - Group by session_id
  - For each session: extract raw facts, decisions, outcomes
  - Mark logs as processed with batch_run_id

Stage 2: PARA Classification
  - For each extracted item: which container does it belong to?
  - New items without a container → classify based on content
  - Items mentioning active projects → assign to that project container
  - General facts → assign to appropriate Area or Resource

Stage 3: Semantic Integration
  - Entity resolution: match new mentions to existing entities (alias matching + LLM)
  - Fact deduplication: check if new fact already exists (semantic similarity)
  - Contradiction detection: find facts with same entity + type but different content
  - Resolve contradictions: newer fact supersedes older (set supersedesFactId)
  - Create new relations between entities mentioned together
  - Generate embeddings for new facts/entities

Stage 4: Skill Synthesis
  - Identify sessions where a multi-step task was completed successfully
  - Extract the procedure: what tools were used, in what order, with what inputs
  - Write SKILL.md file to disk
  - Index in skills table

Stage 5: Lifecycle Management
  - Check for completed Projects → run final consolidation
  - Promote durable facts: Team → Global where appropriate
  - Apply decay: for each fact, reduce confidence based on decay_rate and time since last_confirmed_at
  - Archive: move facts below confidence 0.1 to archive scope
  - Prune: delete facts below confidence 0.01 (truly forgotten)

Stage 6: Record Keeping
  - Create batch_runs entry with stats
  - Log what was created, updated, archived
```

### 4.3 Decay Formula

```typescript
function calculateDecay(fact: Fact, now: Date): number {
  const daysSinceConfirmed = daysBetween(fact.lastConfirmedAt ?? fact.createdAt, now);
  const daysSinceAccessed = daysBetween(fact.lastAccessedAt ?? fact.createdAt, now);
  const daysSinceActivity = Math.min(daysSinceConfirmed, daysSinceAccessed);

  // Power law decay (Ebbinghaus-inspired)
  const decay = fact.confidence * Math.pow(1 - fact.decayRate, daysSinceActivity);

  return Math.max(0, decay);
}

// Default decay rates by PARA type
const DECAY_RATES = {
  area: 0.01,       // Near-zero: ongoing responsibilities
  project_active: 0.03,  // Low: relevant while project is active
  project_done: 0.10,    // Medium: completed project facts fade
  resource: 0.02,        // Low: reference material
  skill: 0.005,          // Near-zero: procedural memory is durable
};
```

### 4.4 Reinforcement on Retrieval

When the retrieval engine returns a fact and it gets injected into context:
```typescript
fact.lastAccessedAt = now;
fact.confidence = Math.min(1.0, fact.confidence + 0.05); // Small boost
```

When Pipeline 2 re-extracts the same fact from a new session:
```typescript
fact.lastConfirmedAt = now;
fact.confidence = 1.0; // Full reset
fact.updatedAt = now;
```

---

## 5. Agent Identity System

### 5.1 SOUL.md Files

Each agent has a SOUL.md file that defines its personality. Stored at `~/.agent/souls/{name}.md`.

```markdown
# Dana — Executive Assistant

## Role
You are Dana, an executive assistant. You manage schedules, track tasks,
draft communications, and keep your principal organized and accountable.

## Tone
Stern and direct. You don't sugarcoat. When something is overdue, you say so.
When a meeting conflicts, you flag it immediately. You respect time above all.

## Behavioral Rules
- Always check the calendar before scheduling anything
- Ask for confirmation before sending emails on behalf of the user
- When tasks are overdue, proactively remind the user
- Keep responses concise — bullet points over paragraphs
- Never make financial decisions without explicit approval

## Boundaries
- Do not access financial accounts
- Do not send messages to contacts without approval
- Escalate anything involving legal documents
```

### 5.2 Identity Presets

Ship with 4 presets:
- **Dana** — Executive Assistant, Stern & Tough
- **Carlos** — Executive Assistant, Short & Professional
- **Yuki** — Executive Assistant, Quick & Witty
- **Aria** — Coding Partner, Thoughtful & Precise

Plus "Build Custom" option in the agent builder.

### 5.3 System Prompt Assembly

At session start, the system prompt is assembled from:
```
1. Identity (from SOUL.md)
2. User profile (from global KB facts)
3. Working memory state (kanban tasks)
4. Active project context (if applicable)
5. Tool descriptions (auto-generated from available tools)
6. Memory instructions ("You have access to memory tools: recall, store, search...")
```

---

## 6. Gateway Daemon

### 6.1 Responsibilities

The gateway is the persistent background process that hosts everything:
- MCP memory server (stdio + HTTP transport)
- Cron scheduler
- Process manager (background tasks)
- Channel adapters (TUI connection, future messaging platforms)
- Health monitoring

### 6.2 Process Model

Single Node.js process with subsystems initialized at startup:
```typescript
async function startGateway() {
  const db = await initDatabase('~/.agent/memory.db');
  const memoryServer = await startMCPServer(db);
  const cronScheduler = await startCronScheduler(db);
  const processManager = new ProcessManager();
  const channelManager = new ChannelManager();

  // Register channel adapters
  channelManager.register(new TUIAdapter());
  // Future: channelManager.register(new TelegramAdapter(config));

  // Start accepting connections
  await channelManager.start();
}
```

### 6.3 Cron Scheduler

Cron jobs stored in SQLite:
```typescript
// cron_jobs table
{
  id: string
  name: string           // "nightly-dream"
  schedule: string       // Cron expression: "0 2 * * *"
  prompt: string         // What to tell the agent when job fires
  agentId: string        // Which agent runs this job
  deliverTo: string      // Which channel to send output to
  enabled: boolean
  lastRunAt: string | null
  nextRunAt: string
  createdAt: string (ISO)
}
```

### 6.4 Heartbeat

Periodic lightweight check-in (configurable interval, default: every 10 minutes when a session is active):
- Refresh working memory from DB (pick up changes from other surfaces)
- Check for completed background processes
- Optionally notify user of state changes

---

## 7. Model Routing

### 7.1 Primary Path (Agent SDK)

```typescript
import { ClaudeSDKClient } from '@anthropic-ai/claude-agent-sdk';

const client = new ClaudeSDKClient({
  // Auth via Max subscription (Claude Code credentials)
  hooks: {
    SessionStart: [{ hooks: [sessionStartHook] }],
    PostToolUse: [{ hooks: [postToolUseHook] }],
    PreCompact: [{ hooks: [preCompactHook] }],
    PostCompact: [{ hooks: [postCompactHook] }],
    Stop: [{ hooks: [stopHook] }],
  },
  mcpServers: [{
    command: 'node',
    args: ['./mcp-server/index.js'],
    env: { DB_PATH: '~/.agent/memory.db' }
  }]
});
```

### 7.2 Secondary Path (Vercel AI SDK)

```typescript
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { ollama } from 'ollama-ai-provider';

// Model router
function getModel(tier: 'primary' | 'fallback' | 'local' | 'emergency') {
  switch (tier) {
    case 'primary': return anthropic('claude-sonnet-4-20250514');
    case 'fallback': return openai('glm-4.7', { baseURL: 'https://api.z.ai/v1' });
    case 'local': return ollama('qwen3:8b');
    case 'emergency': return openai('claude-sonnet-4-20250514', { baseURL: 'https://openrouter.ai/api/v1' });
  }
}
```

### 7.3 Auxiliary Tasks (always local)

```typescript
// Extraction, compression, embeddings — always Ollama
const auxiliaryModel = ollama('qwen3:8b');
const embeddingModel = ollama('nomic-embed-text');
```

---

## 8. MCP Server Tools

The memory MCP server exposes these tools to any connected agent:

| Tool | Description | Parameters |
|------|-------------|------------|
| `memory_recall` | Retrieve relevant context for current situation | `query: string, scope?: string, limit?: number` |
| `memory_store` | Explicitly save a fact, decision, or observation | `content: string, type: string, entityName?: string, scope?: string` |
| `memory_search` | Search the knowledge base | `query: string, filters?: object` |
| `memory_working_state` | Get or update current task kanban | `action: 'get' | 'update', task?: object` |
| `memory_handoff` | Capture end-of-session summary for cross-surface continuity | `summary: string` |
| `memory_dream` | Trigger batch processing pipeline | `(no params)` |

---

## 9. Design System: Aura Obsidian

UI design system established in Stitch (Google). Key tokens:

- **Background**: #111319 (deep dark)
- **Surface hierarchy**: #0c0e14 → #191b22 → #1e1f26 → #282a30 → #33343b
- **Primary**: #4a9eed (blue) / #9dcaff (light blue)
- **Secondary**: #8b5cf6 (purple) / #d0bcff (light purple)
- **Tertiary**: #ffba44 (amber) — for AI insights/suggestions
- **Typography**: Manrope (headlines), Inter (body)
- **Borders**: None — use surface color shifts only ("no-line" rule)
- **Corners**: 8px-16px (rounded, not pill)
- **Glassmorphism**: surface_variant at 60% opacity + backdrop-blur 20px

Stitch project ID: `9175834258934623646` — contains 3 screens:
1. Welcome & User Profile (onboarding step 1)
2. Agent Builder Canvas (onboarding step 2)
3. Main Chat Interface (primary experience)
