# Memory Architecture — Decision Record

## Project Vision

A personal AI assistant whose core differentiator is a **context persistence layer** — not the agent loop, not the model, not the tools. The memory system is the product. The agent is almost commoditized; what doesn't exist yet is intelligent, structured memory that survives compaction, crosses surfaces, accumulates knowledge over time, and supports multi-agent orchestration.

### Origin Pain Points
1. **Compaction amnesia** — context compression destroys critical mid-session state
2. **Cross-surface discontinuity** — switching from CLI to phone means starting over
3. **No learning over time** — agents don't build durable knowledge without manual effort
4. **Scoped memory silos** — knowledge from one project/context is invisible to others

---

## Core Architecture: Two Pipelines

### Pipeline 1 — Real-Time (every turn)
- **Purpose**: Lightweight capture + working memory maintenance
- **Speed**: Synchronous, must not slow down conversation
- **Intelligence**: Rule-based extraction + cheap/local LLM (Haiku or Ollama 8B)
- **Outputs**: Session logs, working memory updates, task state changes
- **Trigger**: Hook-driven — Agent SDK's native hooks for Claude path, custom middleware for secondary path
- **Primary implementation**: Agent SDK hooks (PostToolUse, Stop, PreCompact, PostCompact)
- **Secondary implementation**: Vercel AI SDK middleware (lighter equivalents)

### Pipeline 2 — Batch ("Dream" Processing)
- **Purpose**: Deep consolidation, entity resolution, skill synthesis, decay
- **Speed**: Can take minutes, runs in background
- **Intelligence**: Capable model (Claude via Max at night, or local 14B)
- **Outputs**: Knowledge base updates, new skills, archived facts, resolved contradictions
- **Trigger**: **Both** time-based (cron, e.g. 2am) **and** session-count threshold (e.g. after 5 sessions), whichever fires first. Plus manual `/dream` command for on-demand processing.

---

## Memory Model: PARA × Brain Taxonomy × Access Scope

Three orthogonal dimensions for every piece of memory:

### Dimension 1: PARA Container (where it lives)
| Container | Maps To | Decay Rate | Injection Priority |
|-----------|---------|------------|--------------------|
| **Project** | Active efforts with outcomes | Medium (decays when project completes) | High (if project is active) |
| **Area** | Ongoing responsibilities | Near-zero (always relevant) | High (always) |
| **Resource** | Reference material | Low (useful when retrieved) | On-demand (semantic match only) |
| **Archive** | Completed/decayed items | Already decayed | Never auto-injected |

### Dimension 2: Brain Memory Type (what kind of thing)
| Type | Brain Analog | Example | Processing |
|------|-------------|---------|------------|
| **Episodic** | Hippocampal recording | Session logs, raw conversation | Stored by Pipeline 1, consolidated by Pipeline 2 |
| **Semantic** | Neocortical facts | "Project uses JWT with refresh tokens" | Extracted by Pipeline 2 from episodes |
| **Procedural** | Motor/skill memory | "How to deploy Project Atlas" | Synthesized by Pipeline 2 from successful task completions |
| **Prospective** | Intentions | "Need to follow up with Alice about PR" | Tracked in working memory kanban |

### Dimension 3: Access Scope (who can see it)
| Scope | Visibility | Example |
|-------|-----------|---------|
| **Private** | Only the owning agent | Debugging scratchpad, failed attempts, working memory |
| **Team** | All agents on a project | Architectural decisions, task states, conventions |
| **Global** | All agents, all projects | User preferences, tech stack, people, skills, hardware |

### Promotion Rules (Pipeline 2 decides)
- **Private → Team**: Architectural decisions, blocking issues, task completions, convention changes
- **Team → Global**: User preferences, reusable skills, entity facts, infrastructure knowledge
- **Stays Private**: Scratchpad reasoning, failed attempts, intermediate work
- **Demotion**: Stale team context → archived; invalidated facts → removed

---

## Working Memory: Kanban Model

Each agent has a kanban board of tasks that persists outside the context window.

### Task States
```
Backlog → Active → Blocked → Done → (Archived by Pipeline 2)
```

### Task Structure
- **id**: Unique identifier
- **title**: Brief description ("Fix token expiry bug in auth module")
- **state**: backlog | active | blocked | done
- **context**: Structured data — files involved, branches, relevant decisions
- **decisions**: Array of decisions made while working on this task
- **blockers**: What's preventing progress (if blocked)
- **open_questions**: Unresolved items
- **created_at / updated_at**: Timestamps
- **agent_id**: Which agent owns this task
- **project_id**: Which project this belongs to

### Working Memory Lifecycle
1. **Session starts** → Active tasks injected into context
2. **During session** → Hooks update task state, capture decisions
3. **Compaction fires** → Working memory snapshot preserved, re-injected post-compact
4. **Surface switch** → New session loads same kanban board
5. **Task completes** → Moves to Done, Pipeline 2 archives + extracts durable learnings
6. **Agent swap** → New agent sees the full board, picks up active tasks

### Multi-Agent Implications
- Each agent has its own private kanban board
- Team-scoped tasks visible to all agents on a project
- Agent A can move a task to "done" and Agent B sees it immediately
- Blocked tasks with reasons help the router assign work to the right agent

---

## Knowledge Graph: Medium Complexity

### Entities (Nodes)
Typed nodes representing things in the world:
- **Types**: person, project, tool, service, concept, codebase, organization, device, account, language, framework
- **Properties**: name, aliases (for entity resolution), description, type
- **Container**: Primary PARA container
- **Scope**: private | team | global

### Facts (Claims)
Discrete pieces of knowledge attached to entities:
- **Types**: preference, decision, convention, status, capability, biographical, environmental, observation, lesson_learned, goal, blocker
- **Properties**: content (human-readable), structured (JSON for queries), confidence, decay_rate
- **Temporal**: created_at, updated_at, last_confirmed_at, last_accessed_at, expires_at
- **Provenance**: source_session_id, source_type (stated | extracted | inferred | promoted), extracted_by
- **Supersession**: supersedes_fact_id (for tracking when facts replace older facts)

### Relations (Typed Edges)
Directional, typed connections between entities:
- **Types**: works_on, uses, owns, created_by, depends_on, replaces, related_to, part_of, collaborates_with, deployed_on, integrates_with
- **Properties**: label (context), directional flag, confidence
- No inference — relations are explicitly created by Pipeline 2, not derived

### What "Medium" Means (No Inference)
- Relations are stored and queryable but NOT transitively computed
- If A→uses→B and B→depends_on→C, the system does NOT auto-infer A→depends_on→C
- Contradiction detection is done by Pipeline 2 comparing timestamps/confidence, not by graph reasoning
- Entity resolution uses alias matching + Pipeline 2 LLM judgment, not graph algorithms

---

## Skills (Procedural Memory)

- Stored as markdown files on disk (human-readable, version-controllable)
- Indexed in SQLite for metadata, search, and vector retrieval
- Follow agentskills.io standard for portability
- **Created by Pipeline 2** after detecting successful multi-step task completions (not by the agent mid-session)
- Track usage count, success rate, last used timestamp
- Lowest decay rate of any memory type (procedural memory is highly durable)
- Skills link to entities (which tools/projects they involve)
- Global scope by default (a deployment recipe works regardless of which agent uses it)

---

## Session Logs (Episodic Memory)

- Append-only log of every turn across all agents and sessions
- Stored in SQLite with full-text search (FTS5)
- Fields: session_id, agent_id, project_id, surface, turn_index, role, content, tool_name, tool_input, model, token_count, timestamps
- **Raw material for Pipeline 2** — agents don't query this directly (they query the KB)
- Batch processing marks logs as processed with batch_run_id
- Retention policy: raw logs kept for N days, then archived/pruned

---

## Temporal Decay Model

Inspired by the brain's forgetting curve (Ebbinghaus power law):

### Decay Rates by Memory Type
| Memory Type | Decay Rate | Rationale |
|-------------|-----------|-----------|
| Procedural (skills) | ~0 | Once you know how, you know how |
| Area facts | ~0.01/day | Ongoing responsibilities rarely change |
| Global preferences | ~0.02/day | Preferences shift slowly |
| Project facts | ~0.05/day | Relevant while project is active |
| Episodic (session details) | ~0.15/day | Specific details fade fast |

### Reinforcement
- **Retrieval resets the clock**: Every time a fact is retrieved and injected, `last_accessed_at` resets and confidence gets a small boost
- **Reconfirmation strengthens**: If Pipeline 2 re-extracts the same fact from a new session, confidence resets to 1.0
- **Spacing effect**: Facts confirmed across multiple sessions with gaps between them get permanence bonuses
- **Confidence floor**: Below 0.1 confidence → archived (still queryable but never auto-injected)

---

## Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Language | TypeScript | Agent SDK native, type safety, single language |
| Primary agent | Anthropic Agent SDK | Full hook system (18 events), built-in tools, compaction, prompt caching, subagents |
| Secondary agent | Vercel AI SDK | Model-agnostic fallback for non-Claude: GLM, Ollama, OpenRouter |
| Auxiliary tasks | Vercel AI SDK → Ollama | Extraction, compression, embeddings — always local, zero cost |
| Database | SQLite | Zero infrastructure, single file, portable |
| ORM | Drizzle | Typed schemas, migrations, lightweight |
| Vector search | sqlite-vec | In-process, no external service |
| Embeddings | Local model via Ollama (nomic-embed-text) | Zero cost, zero latency |
| Full-text search | SQLite FTS5 | Built-in, fast keyword search |
| Frontend | TUI + Web GUI (TBD) | Own the interface |
| Mobile | Gateway bot (Telegram/Discord) | Full memory access from phone |

### Dual Model Layer

**Primary path (Agent SDK):**
- Claude via Max subscription
- Full hook lifecycle: SessionStart, PreToolUse, PostToolUse, PreCompact, PostCompact, Stop, etc.
- Built-in tools: Bash, Read, Write, Edit, Grep, Glob, WebSearch, Agent (subagents)
- Built-in compaction with PostCompact re-injection
- Memory integration via MCP server + hooks
- This is the rich, fully-featured experience

**Secondary path (Vercel AI SDK):**
- GLM 4.7 (z.ai), local Ollama models, OpenRouter
- Custom middleware layer providing lighter hook equivalents (onPrompt, postToolCall, onTurnEnd)
- Custom compaction implementation (since no built-in)
- Same memory MCP server — the memory layer doesn't know which path called it
- Used when Claude is throttled or for tasks better suited to other models

**Auxiliary path (Vercel AI SDK → Ollama, always):**
- Real-time extraction (Pipeline 1 lightweight processing)
- Context compression/summarization
- Embedding generation for sqlite-vec
- Batch pipeline processing (Pipeline 2)
- Runs on local 3080 desktop rig — zero marginal cost

### Model Routing
| Tier | Provider | SDK | Use Case | Cost |
|------|----------|-----|----------|------|
| 1 | Claude (Max subscription) | Agent SDK | Primary agent, deep reasoning, coding | $0 flat |
| 2 | GLM 4.7 (z.ai subscription) | Vercel AI SDK | Fallback agent when Claude throttled | $0 flat |
| 3 | Local Ollama (3080 desktop) | Vercel AI SDK | All auxiliary: extraction, compression, embeddings, batch | $0 electricity |
| 4 | OpenRouter ($5 balance) | Vercel AI SDK | Emergency fallback only | Pay-per-token |

---

## Multi-Agent Design (Phase 6)

Designed for now, built later. Key primitives already in place:

- **Every agent is the same struct, different config** (system prompt, model, tools, hooks, SDK path)
- **SDK choice per agent**: Claude-based agents use Agent SDK, others use Vercel AI SDK — memory layer is shared regardless
- **Agent Registry**: Declarative config defines available agents, their capabilities, and which SDK path they use
- **Shared kanban**: Team-scoped task boards visible to all agents on a project
- **Shared KB**: Team and global scoped facts accessible to all agents
- **Private working memory**: Each agent's scratchpad is isolated
- **Message bus**: Agents communicate via task queue (not direct conversation)
- **MCP Hub**: Centralized tool registry, assigned per-agent

---

## Platform Features (Beyond Memory)

Features selected from OpenClaw/Hermes analysis — things worth building:

### Gateway Daemon (Core Infrastructure)
- Persistent background process (systemd on Linux, launchd on macOS)
- Hosts: MCP memory server, cron scheduler, process manager, channel adapters
- WebSocket or HTTP control plane for TUI/GUI to connect to
- Health monitoring + restart on crash
- Tailscale integration for remote access to memory layer
- `doctor` command for configuration validation and diagnostics
- **Must be running for anything to work** — this is the spine of the system

### Heartbeat + Cron Scheduling
- Natural language cron job definition ("every morning at 8am, check my GitHub notifications")
- Jobs run as full agent sessions with memory access
- Delivery to any connected surface (TUI notification, future Telegram/Discord)
- Triggers for batch pipeline: cron-based (e.g. 2am daily) + session-count threshold
- Manual `/dream` command for on-demand batch processing
- Heartbeat: periodic lightweight check-in (can trigger memory refresh, status updates)

### Process Management
- Agent can spawn long-running processes (builds, test suites, deployments)
- Background monitoring with configurable notification verbosity
- Process completion triggers notification to user on active surface
- Process output captured in session log for memory extraction
- Prevents blocking: agent continues conversation while process runs

### Deferred Features (build later)
- **Voice input**: Whisper transcription via local faster-whisper on 3080 — design audio message support into gateway from the start, implement transcription later
- **Live Canvas / Visual workspace**: Agent-to-UI protocol for rendering diagrams, dashboards — later-phase GUI feature
- **Messaging gateway**: Telegram first when ready, Discord second — gateway daemon architecture supports adding channel adapters without restructuring
- **Docker sandboxing**: For untrusted tool execution — add when giving agent more autonomy
- **Web GUI**: After TUI is stable
- **Skills marketplace**: Never (personal assistant, not a platform)

---

## Agent Identity System

Inspired by OpenClaw's SOUL.md and USER.md pattern, extended with customizable presets.

### User Profile (USER.md equivalent)
- Populated during onboarding wizard
- Stored in global KB as the foundational "user" entity with biographical, preference, and environmental facts
- Injected into every agent's context regardless of identity
- Updated by Pipeline 2 as it learns more about the user over time

### Agent Identity (SOUL.md equivalent)
- Each agent has a `soul.md` file defining its personality, role, tone, and default behaviors
- Stored as markdown (human-readable, version-controllable)
- Referenced by agent config, swappable without changing tools or knowledge
- Presets provide starting points; fully customizable

### Preset Identities (examples)
| Name | Role | Tone | Behaviors |
|------|------|------|-----------|
| Dana | Executive Assistant | Stern, thorough | Anticipates needs, proactive follow-ups, detailed responses |
| Carlos | Executive Assistant | Short, professional | No-nonsense, brief responses, action-oriented |
| Yuki | Executive Assistant | Quick, witty | Playful but effective, concise, uses humor sparingly |
| (Custom) | User-defined | User-defined | User-defined |

---

## Onboarding & Agent Builder

### Step 1: Onboarding Wizard (User Profile)
- Conversational Q&A — feels like talking to the assistant, not filling a form
- Questions: name, role/occupation, current projects, daily tools, communication style preference, technical level
- Output: populates User Profile entity + facts in global KB
- This is the seed data every agent inherits

### Step 2: Agent Builder Canvas
- Visual canvas with three card decks at the bottom of the screen
- Each deck opens a card picker for one dimension of the agent
- Cards are visual, selectable, with brief descriptions
- Presets first for quick start, custom option for advanced users

#### Deck 1: Identity
- Card-style picker for personality presets (Dana, Carlos, Yuki, Custom)
- Each card shows: name, role, tone description, sample response preview
- Selecting a card loads the SOUL.md template
- Custom opens an editor for name, role, tone, behavior sliders
- **Produces**: `agent.soul.md`

#### Deck 2: Skills & Tools
- Cards for tool bundles grouped by function:
  - **Communication**: Gmail, Slack, Discord
  - **Productivity**: Google Calendar, Notion, Linear/Jira
  - **Development**: GitHub, Terminal/Code, Browser
  - **Custom**: "Add MCP Server" for advanced users
- Each card shows what the agent can DO, not just the tool name
- OAuth/API key setup handled inline when card is selected
- Onboarding nudge: "Connect Google Workspace to get the most out of your assistant"
- **Produces**: `agent.tools[]` (MCP server list + built-in tool permissions)

#### Deck 3: Knowledge & Memory
Three rows within the deck:

**Row 1 — Built-in** (always on):
- AI Model Knowledge (greyed out, always included)
- Web Search (on by default)
- Your Profile (on by default, populated from Step 1)

**Row 2 — Connected Sources** (external knowledge via MCP):
- Google Drive/Docs, Notion, Obsidian Vault, Jira/Linear, GitHub
- Each card handles its own auth flow when selected
- "Custom MCP" card for advanced users

**Row 3 — Memory & Learning** (the differentiator):
- Working Memory (on by default) — "Tracks your active tasks across sessions"
- Knowledge Base (on by default) — "Builds structured understanding over time"
- Dream Processing (toggle, recommended) — "Consolidates memories overnight"
- Skill Learning (toggle, recommended) — "Learns procedures from your successes"

**Produces**: `agent.knowledge{}` (memory config + source connections + feature toggles)

### Step 3: Scope & Deploy
- Context scope selector: Everything / Specific projects / Current project only
- Sets the agent's PARA container access permissions
- Name the agent instance
- Review full config summary
- Deploy → agent config saved to registry
- **Produces**: `agent.config.json` (complete declarative agent definition)

### What agent.config.json Contains
```
{
  "id": "agent_001",
  "name": "Dana",
  "identity": "./souls/dana.md",
  "model": { "primary": "claude", "fallback": "glm" },
  "tools": ["gmail", "calendar", "notion", "terminal", "web_search"],
  "knowledge": {
    "sources": ["google_drive", "notion"],
    "memory": {
      "workingMemory": true,
      "knowledgeBase": true,
      "dreamProcessing": true,
      "skillLearning": true
    },
    "scope": {
      "tier": "global",
      "containers": ["*"]
    }
  }
}
```

---

## Build Order (Proposed)

### Phase 1: Memory Layer (the product)
1. SQLite schema + Drizzle ORM setup
2. Working memory (kanban) — CRUD + state machine
3. Session logging — append-only capture
4. Fact/entity/relation storage — core KB tables
5. Embedding generation + sqlite-vec indexing
6. Retrieval engine — semantic + keyword, scoped by tier
7. MCP server wrapping the memory layer (stdio + HTTP transport)

### Phase 2: Gateway Daemon + Primary Agent
8. Gateway daemon process (persistent, manages lifecycle of all subsystems)
9. Agent SDK integration (ClaudeSDKClient) with Max subscription auth
10. Hook pipeline wiring — SessionStart, PostToolUse, PreCompact, PostCompact, Stop
11. Pipeline 1 wiring — hooks → session log + working memory updates
12. Context assembly — working memory + KB retrieval → prompt injection via hooks
13. MCP server connection — Agent SDK connects to memory MCP server for voluntary recall/store
14. Process manager — spawn, monitor, notify on background tasks

### Phase 3: TUI + Agent Builder
15. TUI (terminal interface) connected to gateway daemon
16. Onboarding wizard (conversational user profile setup)
17. Agent builder canvas (identity deck, tools deck, knowledge deck)
18. Agent config registry (CRUD for agent.config.json + soul.md files)
19. Identity presets (Dana, Carlos, Yuki + custom builder)
20. Cron scheduler hosted by gateway daemon
21. Heartbeat system (periodic memory refresh / status checks)
22. `/dream` command for manual batch pipeline trigger
23. `doctor` command for diagnostics

### Phase 4: Batch Pipeline
24. Session log reader + PARA classifier
25. Fact extractor (local LLM via Vercel AI SDK → Ollama)
26. Entity resolver (alias matching + LLM)
27. Skill synthesizer
28. Decay + reconciliation pass
29. Cron integration (auto-trigger at 2am + session-count threshold)

### Phase 5: Secondary Agent (Vercel AI SDK)
30. Vercel AI SDK integration for GLM, Ollama, OpenRouter
31. Custom middleware layer (lighter hook equivalents for non-Claude path)
32. Custom compaction implementation for non-Claude models
33. Same memory MCP server connection — unified memory regardless of model

### Phase 6: Mobile + Web
34. Telegram gateway (channel adapter for gateway daemon)
35. Web GUI (agent builder canvas as web app)
36. Voice input (Whisper transcription on local 3080)

### Phase 7: Multi-Agent
37. Agent registry + multi-agent config
38. Router/supervisor
39. Team-scoped kanban
40. Task queue + message bus

---

## Open Questions (for future sessions)

### Architecture
- **Agent SDK + Max subscription**: Assuming personal use is permitted, but ToS is ambiguous — monitor Anthropic's policy updates. Fallback plan is API keys if enforcement tightens.
- **Hook-to-memory mapping**: Exactly which Agent SDK hook events trigger which memory operations? Need a detailed mapping table.
- **Gateway daemon design**: Process supervision model — single process with subsystems, or multiple processes with IPC? What restarts what on crash?
- **TUI framework choice**: Ink (React for CLI)? Blessed? Raw ANSI? What's the right fit for a TypeScript agent TUI?

### Memory Layer
- Working memory: how many active tasks should be injected into context? All? Top 3? Only the current one?
- Retrieval budget: how many tokens of KB facts should be injected per turn? Fixed limit or adaptive?
- Skill creation threshold: what heuristic determines "this session produced a skill-worthy procedure"?
- Schema for the PARA containers table — nesting depth, lifecycle transitions
- Exact Drizzle schema for all tables (started but paused per request to keep brainstorming)
- **Obsidian integration**: Should the KB sync bidirectionally with Ty's Obsidian vault? Connects to the second brain project in another scope. PARA structure already mirrors the vault.

### Secondary Path
- **Vercel AI SDK middleware design**: What subset of Agent SDK hook semantics can be replicated in the secondary path? What's the minimal viable hook set for non-Claude models?
- **Compaction parity**: How close does the custom compaction for the secondary path need to be to the Agent SDK's built-in compaction?

### Platform
- **Cron job persistence**: Where do cron definitions live? SQLite? Config file? Both?
- **Process manager scope**: Which tools can spawn background processes? All bash commands? Only explicitly marked ones?
- **Tailscale integration depth**: Just networking, or use Tailscale Funnel to expose the memory MCP server as a remote HTTP endpoint?

### Onboarding & Agent Builder
- **TUI agent builder**: The card deck canvas concept is visual — how does this translate to a terminal interface for Phase 3? Simplified TUI wizard first, full canvas in Phase 6 web GUI?
- **Identity customization depth**: How granular should the custom identity builder be? Sliders for tone? Freeform system prompt editor? Both?
- **Preset expansion**: What roles beyond executive assistant? Coding partner, research analyst, project manager, writing editor?
- **Agent config hot-reload**: Can you change an agent's identity/tools/knowledge mid-session, or does it require a restart?
- **Memory Palace visualization**: What does the KB preview look like in the agent builder? Entity count? Graph thumbnail? Recent facts list?

---

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Build custom, not extend OpenClaw/Hermes | Memory layer IS the product; existing frameworks' memory opinions conflict with ours |
| 2026-03-21 | TypeScript | Agent SDK native, single language across stack |
| 2026-03-21 | Agent SDK primary, Vercel AI SDK secondary | Full hook system for Claude path, model-agnostic fallback for everything else |
| 2026-03-21 | SQLite + Drizzle + sqlite-vec | Local-first, zero infrastructure, single file |
| 2026-03-21 | PARA × Brain memory model | PARA for organization, brain taxonomy for processing logic |
| 2026-03-21 | Kanban working memory | Tasks flow through states; survives compaction + surface switches |
| 2026-03-21 | Two-pipeline architecture | Real-time hooks (Pipeline 1) + nightly batch "dream" (Pipeline 2) |
| 2026-03-21 | Batch trigger: cron + session count + manual | Both automatic triggers, whichever fires first, plus /dream |
| 2026-03-21 | Medium knowledge graph | Typed relations, no inference engine |
| 2026-03-21 | Three-tier scoping | Private / team / global with promotion rules |
| 2026-03-21 | TUI first, no mobile gateway initially | Iterate on memory system fast; gateway daemon ready for channels later |
| 2026-03-21 | Gateway daemon + cron + process mgmt | Core platform features; gateway is the spine that hosts everything |
| 2026-03-21 | Agent identity via SOUL.md + presets | Customizable personalities with card-based picker; presets for quick start |
| 2026-03-21 | Three-deck agent builder canvas | Identity + Skills/Tools + Knowledge/Memory as visual card decks |
| 2026-03-21 | Onboarding wizard populates User Profile | Conversational Q&A seeds global KB before first agent is built |
| 2026-03-21 | Build custom, not extend OpenClaw/Hermes | Memory layer IS the product; existing frameworks conflict with our design |
| 2026-03-21 | Competitive differentiation: PARA org + two-pipeline + deterministic capture | Mem0, Mastra OM, Letta, Claude /dream all lack these three together |
