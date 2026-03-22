# Implementation Plan

## Prerequisites

```bash
# Required tools
node >= 22
pnpm >= 9
ollama (with nomic-embed-text and qwen3:8b models pulled)

# Project init
pnpm init
pnpm add typescript drizzle-orm better-sqlite3 drizzle-kit
pnpm add -D @types/better-sqlite3 vitest tsx
# Additional deps added per phase
```

---

## Phase 1: Memory Layer (Weeks 1-2)

The memory layer is the product. Everything else builds on it.

### 1.1 Project Scaffolding
- [ ] Initialize pnpm monorepo with `packages/memory`, `packages/shared`
- [ ] Configure TypeScript with strict mode, ESM, path aliases
- [ ] Set up Vitest for testing
- [ ] Create `packages/shared/src/types.ts` with all shared type definitions (PARA types, scope types, memory types, brain types)

### 1.2 Database Schema + Drizzle Setup
- [ ] Install and configure Drizzle ORM with better-sqlite3
- [ ] Create schema files for all tables (see ARCHITECTURE.md §1.2-1.12):
  - `schema/containers.ts` — PARA containers
  - `schema/entities.ts` — knowledge graph nodes
  - `schema/facts.ts` — knowledge graph claims
  - `schema/relations.ts` — knowledge graph edges
  - `schema/entity-containers.ts` — many-to-many links
  - `schema/working-memory.ts` — kanban tasks
  - `schema/session-logs.ts` — episodic memory + FTS5
  - `schema/skills.ts` — procedural memory index
  - `schema/embeddings.ts` — sqlite-vec vectors
  - `schema/identities.ts` — agent identities
  - `schema/batch-runs.ts` — dream processing metadata
  - `schema/cron-jobs.ts` — scheduled tasks
- [ ] Configure drizzle-kit for migrations
- [ ] Generate and run initial migration
- [ ] Create FTS5 virtual table for session_logs full-text search
- [ ] **Test**: DB creates, migrates, all tables exist with correct columns

### 1.3 Store Layer (CRUD)
- [ ] `store/containers.ts` — create, update, archive, list by paraType, get by id, get children
- [ ] `store/entities.ts` — create, update, findByAlias, list by type/container/scope
- [ ] `store/facts.ts` — create, update, supersede, list by entity/container/scope, search by type
- [ ] `store/relations.ts` — create, list by source/target entity, list by type
- [ ] `store/working-memory.ts` — create task, transition state (backlog→active→blocked→done), get active tasks, get by agent/project
- [ ] `store/session-logs.ts` — append turn, get by session, full-text search, mark as processed
- [ ] `store/skills.ts` — create, update usage stats, list by category/tags, search
- [ ] `store/batch-runs.ts` — create, update stats, get latest
- [ ] **Test**: Full CRUD for each store with edge cases (duplicates, missing FKs, scope filtering)

### 1.4 Working Memory State Machine
- [ ] Implement kanban state transitions with validation:
  - `backlog → active` (only if no other task is active for this agent, or allow multiple)
  - `active → blocked` (requires blocker reason)
  - `blocked → active` (clears blocker)
  - `active → done` (sets completedAt)
  - `done → archived` (Pipeline 2 handles)
- [ ] `getBoard(agentId, projectId?)` — returns all tasks grouped by state
- [ ] `formatForInjection(board)` — renders kanban as markdown for context injection
- [ ] **Test**: All state transitions, invalid transitions rejected, formatting output

### 1.5 Embedding Generation
- [ ] Install sqlite-vec binding for Node.js
- [ ] Create `embeddings/generator.ts` — calls Ollama `nomic-embed-text` endpoint
- [ ] Create `embeddings/index.ts` — insert/query sqlite-vec
- [ ] Batch embedding function for initial indexing
- [ ] **Test**: Generate embedding for text, store in sqlite-vec, retrieve by similarity

### 1.6 Retrieval Engine
- [ ] `retrieval/semantic.ts` — embed query → sqlite-vec similarity search → rank by similarity × confidence × recency
- [ ] `retrieval/keyword.ts` — FTS5 search on session_logs
- [ ] `retrieval/scoped.ts` — filter results by scope (global + team for project + private for agent)
- [ ] `retrieval/assembler.ts` — combine results into injection blocks:
  - Working memory block
  - User profile block
  - Project context block
  - Semantic retrieval block
  - Skills block
- [ ] Token budget enforcement — fit within configurable limit (default 2000 tokens)
- [ ] `retrieval/index.ts` — main `assembleContext(agentId, projectId, prompt)` function
- [ ] **Test**: Retrieval returns relevant results, respects scope, stays within token budget

### 1.7 MCP Server
- [ ] `pnpm add @modelcontextprotocol/sdk`
- [ ] Create `packages/mcp-server/` package
- [ ] Implement MCP tools:
  - `memory_recall` — calls retrieval engine
  - `memory_store` — creates fact (optional entity linking)
  - `memory_search` — full-text + semantic search
  - `memory_working_state` — get/update kanban
  - `memory_handoff` — capture session summary
  - `memory_dream` — trigger batch pipeline
- [ ] Stdio transport (for local Agent SDK / Claude Code connection)
- [ ] HTTP transport (for remote connections / future Telegram gateway)
- [ ] **Test**: Each tool callable via MCP protocol, returns correct results

### Phase 1 Acceptance Criteria
- [ ] Can create PARA containers, entities, facts, relations via store API
- [ ] Working memory kanban CRUD with state machine
- [ ] Session logs append + FTS5 search works
- [ ] Embeddings generate locally via Ollama and store in sqlite-vec
- [ ] Retrieval engine assembles scoped context within token budget
- [ ] MCP server starts and all 6 tools return results
- [ ] All tests pass

---

## Phase 2: Gateway Daemon + Primary Agent (Weeks 3-4)

### 2.1 Gateway Daemon
- [ ] Create `packages/gateway/` package
- [ ] Daemon entry point — persistent Node.js process
- [ ] Subsystem initialization: database, MCP server, cron scheduler, process manager
- [ ] Graceful shutdown handling (SIGTERM, SIGINT)
- [ ] PID file for single-instance enforcement
- [ ] Health check endpoint (HTTP on configurable port)
- [ ] `doctor` command — validate config, check Ollama connectivity, verify DB integrity
- [ ] **Test**: Daemon starts, initializes subsystems, responds to health check, shuts down cleanly

### 2.2 Agent SDK Integration
- [ ] `pnpm add @anthropic-ai/claude-agent-sdk`
- [ ] Create `packages/agent/src/primary/claude-agent.ts`
- [ ] Configure ClaudeSDKClient with hooks + MCP server connection
- [ ] Auth: support Claude Max subscription (OAuth from Claude Code) + API key fallback
- [ ] **Test**: Agent SDK initializes, connects to MCP server, responds to a prompt

### 2.3 Hook Pipeline (Pipeline 1 Wiring)
- [ ] `hooks/session-start.ts` — load working memory + KB → inject via additionalContext
- [ ] `hooks/user-prompt.ts` — run semantic retrieval → inject via additionalContext
- [ ] `hooks/post-tool-use.ts` — log to session log + rule-based extraction + working memory update
- [ ] `hooks/pre-compact.ts` — snapshot working memory to DB
- [ ] `hooks/post-compact.ts` — re-inject working memory + KB facts
- [ ] `hooks/stop.ts` — end-of-turn extraction (call local Ollama for fact extraction) + flush session log
- [ ] Register all hooks with ClaudeSDKClient
- [ ] **Test**: Each hook fires at correct point, writes to correct DB tables, injection appears in context

### 2.4 Process Manager
- [ ] `process-mgr/manager.ts` — spawn child processes, track PID, monitor status
- [ ] Output capture — stream stdout/stderr to buffer
- [ ] Completion notification — callback when process exits
- [ ] Kill / interrupt support
- [ ] **Test**: Spawn process, capture output, detect completion, kill running process

### Phase 2 Acceptance Criteria
- [ ] Gateway daemon runs persistently as background process
- [ ] Agent SDK connects to Claude via Max subscription
- [ ] All hooks fire and write to memory DB
- [ ] Working memory survives compaction (pre-compact saves, post-compact re-injects)
- [ ] Session logs capture every turn
- [ ] End-of-turn extraction produces facts from conversation
- [ ] Process manager can spawn and monitor background tasks
- [ ] `doctor` command validates configuration

---

## Phase 3: TUI + Agent Builder (Weeks 5-6)

### 3.1 TUI Framework
- [ ] Evaluate and choose TUI framework (Ink recommended for React-in-terminal)
- [ ] Create `packages/tui/` package
- [ ] Main TUI layout: chat input + message display + status bar
- [ ] Connect to gateway daemon (WebSocket or IPC)
- [ ] Streaming response rendering (token-by-token display)
- [ ] Markdown rendering in terminal

### 3.2 TUI Chat Interface
- [ ] Message input with multiline support
- [ ] Message history display (user + agent messages)
- [ ] Tool use indicators ("📅 Used: Google Calendar")
- [ ] Context pills above input (current task, memory status)
- [ ] `/commands` support: `/new`, `/model`, `/dream`, `/status`, `/tasks`

### 3.3 Onboarding Wizard (TUI version)
- [ ] First-run detection (check if user profile exists in KB)
- [ ] Step 1: User profile questions (name, occupation, use case, preferences)
- [ ] Step 2: Agent selection (text-based identity picker with preset descriptions)
- [ ] Step 3: Tool connections (which integrations to enable)
- [ ] Save user profile facts to global KB
- [ ] Save agent config + identity to registry

### 3.4 Agent Builder (TUI version)
- [ ] Identity management: list presets, select, create custom
- [ ] SOUL.md editor (open in $EDITOR)
- [ ] Tool toggles (enable/disable per agent)
- [ ] Agent config display and edit
- [ ] `/agent` command for managing agents

### 3.5 Cron Scheduler
- [ ] Cron job CRUD (add, remove, list, enable/disable)
- [ ] Cron expression parser (use `node-cron` or similar)
- [ ] Job execution: create agent session, run prompt, deliver output
- [ ] Built-in job: dream trigger (Pipeline 2)
- [ ] Built-in job: session count check (trigger dream if threshold met)
- [ ] `/cron` command in TUI

### 3.6 Heartbeat
- [ ] Configurable interval (default: 10 min when session active)
- [ ] On heartbeat: refresh working memory from DB
- [ ] Check for completed background processes → notify
- [ ] Check for updates from other surfaces → merge

### Phase 3 Acceptance Criteria
- [ ] TUI launches, connects to gateway, renders chat
- [ ] Can have a full conversation with Claude via TUI
- [ ] Working memory visible in status bar or via `/tasks`
- [ ] Onboarding wizard runs on first launch, seeds user profile
- [ ] Agent builder allows selecting preset identities
- [ ] Cron scheduler runs jobs on schedule
- [ ] `/dream` command triggers batch processing
- [ ] Heartbeat refreshes working memory periodically

---

## Phase 4: Batch Pipeline (Weeks 7-8)

### 4.1 Pipeline Runner
- [ ] `consolidation/runner.ts` — orchestrates all pipeline stages
- [ ] Reads unprocessed session logs (grouped by session)
- [ ] Creates batch_run record at start, updates on completion

### 4.2 Stage 1: Episodic Replay
- [ ] Parse session logs into structured turn objects
- [ ] Group by session_id, order by turnIndex
- [ ] Identify tool calls, decisions, outcomes per session

### 4.3 Stage 2: PARA Classification
- [ ] Call local LLM to classify extracted items into PARA containers
- [ ] Match against existing containers (fuzzy name matching)
- [ ] Create new containers if no match found
- [ ] Assign items to containers

### 4.4 Stage 3: Semantic Integration
- [ ] Entity resolution: for each mentioned name, check aliases → create or link
- [ ] Fact deduplication: embed new fact → check similarity against existing → skip if >0.95 similar
- [ ] Contradiction detection: same entity + same fact type + different content → supersede older
- [ ] Relation creation: entities mentioned together in decisions → create typed relation
- [ ] Generate embeddings for all new facts and entities

### 4.5 Stage 4: Skill Synthesis
- [ ] Identify sessions with multi-step task completions (task moved to 'done')
- [ ] Extract procedure: sequence of tool calls + user confirmations
- [ ] Format as SKILL.md (title, description, steps, tools used)
- [ ] Write to `~/.agent/skills/`
- [ ] Index in skills table

### 4.6 Stage 5: Lifecycle Management
- [ ] Decay pass: apply decay formula to all facts
- [ ] Archive pass: move facts below confidence 0.1 to archive
- [ ] Prune pass: delete facts below confidence 0.01
- [ ] Project completion: detect done projects → final consolidation → promote durable facts
- [ ] Promotion pass: identify team facts that appear across projects → promote to global

### 4.7 Stage 6: Record Keeping
- [ ] Update batch_runs with stats
- [ ] Mark all processed session logs with batch_run_id

### Phase 4 Acceptance Criteria
- [ ] `/dream` triggers full pipeline run
- [ ] Cron triggers pipeline at 2am
- [ ] Session count threshold triggers pipeline after 5 sessions
- [ ] Pipeline extracts facts from session logs
- [ ] Entity resolution links mentions to existing entities
- [ ] Contradictions are detected and resolved
- [ ] Skills are created from successful task completions
- [ ] Decay reduces confidence over time
- [ ] Stale facts are archived
- [ ] Batch run stats recorded

---

## Phase 5: Secondary Agent — Vercel AI SDK (Weeks 9-10)

### 5.1 Vercel AI SDK Integration
- [ ] `pnpm add ai @ai-sdk/anthropic @ai-sdk/openai`
- [ ] Configure providers: GLM (z.ai), Ollama (local), OpenRouter
- [ ] Model router with fallback chain

### 5.2 Custom Agent Loop
- [ ] ReAct loop using `generateText` with tools
- [ ] Tool definitions matching Agent SDK built-in tools (bash, read, write, etc.)
- [ ] MCP server connection for memory tools

### 5.3 Middleware Layer
- [ ] `onPrompt` middleware: inject working memory + KB (mirrors SessionStart + UserPromptSubmit)
- [ ] `postToolCall` middleware: log to session + extract (mirrors PostToolUse)
- [ ] `onTurnEnd` middleware: end-of-turn extraction (mirrors Stop)

### 5.4 Custom Compaction
- [ ] Token counting for Vercel AI SDK messages
- [ ] Threshold detection (50% of model's context window)
- [ ] Head-tail preservation compression (same algorithm as ARCHITECTURE.md §2)
- [ ] Working memory snapshot + re-injection post-compression
- [ ] Orphaned tool call sanitization

### Phase 5 Acceptance Criteria
- [ ] Can have a conversation with GLM via Vercel AI SDK
- [ ] Can have a conversation with local Ollama model
- [ ] All middleware fires, writes to same memory DB
- [ ] Compaction works, working memory survives
- [ ] Same memory available regardless of which model path is active

---

## Phase 6: Mobile + Web (Weeks 11-14)

### 6.1 Telegram Gateway
- [ ] Telegram Bot API adapter for gateway daemon
- [ ] Message routing: Telegram → gateway → agent → Telegram
- [ ] Working memory access from Telegram (same DB)
- [ ] Device pairing / allowlist security

### 6.2 Web GUI
- [ ] Web framework (Next.js or similar)
- [ ] Port onboarding wizard to web (card-based builder from Stitch designs)
- [ ] Chat interface (three-column layout from Stitch designs)
- [ ] Memory Palace view (knowledge base browser)
- [ ] Agent builder canvas (full visual card deck experience)

### 6.3 Voice Input
- [ ] Local Whisper transcription via faster-whisper on 3080
- [ ] Audio message support in gateway protocol
- [ ] Telegram voice note → transcription → agent

---

## Phase 7: Multi-Agent (Weeks 15+)

### 7.1 Agent Registry
- [ ] Declarative agent config (`agent.config.json`)
- [ ] Multiple agents with different identities, models, tools, scopes
- [ ] Agent lifecycle management (create, activate, deactivate)

### 7.2 Router / Supervisor
- [ ] Classify incoming prompts → route to best agent
- [ ] Rule-based routing (keywords, project context)
- [ ] LLM-based routing (cheap classifier for ambiguous cases)

### 7.3 Team-Scoped Kanban
- [ ] Shared task boards across agents in a project
- [ ] Agent A creates task → Agent B sees it
- [ ] Task assignment (which agent should handle this)

### 7.4 Task Queue + Message Bus
- [ ] Inter-agent task delegation
- [ ] Async task completion + result propagation
- [ ] No direct agent-to-agent conversation (tasks are the communication primitive)
