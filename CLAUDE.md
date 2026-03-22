# CLAUDE.md — Project Instructions

## What This Project Is

A personal AI assistant whose core differentiator is a **context persistence and memory management layer**. The memory system is the product. The agent loop is infrastructure (Anthropic Agent SDK for Claude, Vercel AI SDK for everything else). The frontend is a TUI initially, web GUI later.

The project solves four specific problems:
1. **Compaction amnesia** — context compression destroys critical mid-session state
2. **Cross-surface discontinuity** — switching surfaces means starting over
3. **No learning over time** — agents don't build durable knowledge without manual effort
4. **Scoped memory silos** — knowledge from one project/context is invisible to others

## Tech Stack

- **Language**: TypeScript (ESM), Node.js ≥22
- **Primary agent**: Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- **Secondary agent**: Vercel AI SDK (`ai`) for GLM, Ollama, OpenRouter
- **Database**: SQLite via Drizzle ORM (`drizzle-orm` + `better-sqlite3`)
- **Vector search**: `sqlite-vec` for embeddings
- **Full-text search**: SQLite FTS5
- **Embeddings**: Local model via Ollama (`nomic-embed-text`)
- **Package manager**: pnpm
- **Test framework**: Vitest

## Project Structure (Target)

```
├── CLAUDE.md                    # This file
├── packages/
│   ├── memory/                  # Core memory layer (the product)
│   │   ├── src/
│   │   │   ├── schema/          # Drizzle schema definitions
│   │   │   ├── store/           # CRUD operations for each table
│   │   │   ├── retrieval/       # Semantic + keyword retrieval engine
│   │   │   ├── extraction/      # Pipeline 1: real-time fact extraction
│   │   │   ├── consolidation/   # Pipeline 2: batch "dream" processing
│   │   │   ├── working-memory/  # Kanban task state machine
│   │   │   └── embeddings/      # Embedding generation + sqlite-vec
│   │   └── tests/
│   ├── mcp-server/              # MCP server wrapping the memory layer
│   │   ├── src/
│   │   │   ├── tools/           # memory_recall, memory_store, memory_search, etc.
│   │   │   └── transports/      # stdio + HTTP transport support
│   │   └── tests/
│   ├── agent/                   # Agent loop + hook pipeline
│   │   ├── src/
│   │   │   ├── primary/         # Agent SDK (Claude) integration + hooks
│   │   │   ├── secondary/       # Vercel AI SDK integration + middleware
│   │   │   ├── hooks/           # Shared hook logic (extraction, injection)
│   │   │   ├── identity/        # SOUL.md system + identity presets
│   │   │   └── router/          # Model routing (Claude → GLM → Local → OpenRouter)
│   │   └── tests/
│   ├── gateway/                 # Persistent daemon process
│   │   ├── src/
│   │   │   ├── daemon/          # Process lifecycle, systemd/launchd
│   │   │   ├── cron/            # Cron scheduler + heartbeat
│   │   │   ├── process-mgr/     # Background task management
│   │   │   └── channels/        # Channel adapters (TUI first, Telegram later)
│   │   └── tests/
│   ├── tui/                     # Terminal user interface
│   │   └── src/
│   └── shared/                  # Shared types, utils, constants
│       └── src/
├── config/                      # Default configs, identity presets
│   ├── identities/              # Preset SOUL.md files (Dana, Carlos, Yuki, Aria)
│   └── defaults/                # Default agent.config.json templates
├── skills/                      # Skill files (markdown, on disk)
└── docs/                        # Architecture docs, this file
```

## Key Architecture Concepts

### Two-Pipeline Model
- **Pipeline 1 (Real-Time)**: Hooks fire on every turn. Rule-based + cheap LLM extraction. Outputs: session logs, working memory updates. Must be fast.
- **Pipeline 2 (Batch "Dream")**: Runs nightly (cron) or after N sessions or manually (`/dream`). Deep extraction, entity resolution, skill synthesis, decay. Uses capable model.

### Memory Model: PARA × Brain × Scope
Every memory has three dimensions:
- **PARA Container**: Project (active, time-bound) | Area (ongoing, no end) | Resource (reference) | Archive (completed/decayed)
- **Brain Type**: Episodic (raw sessions) | Semantic (extracted facts) | Procedural (skills) | Prospective (intentions/tasks)
- **Access Scope**: Private (one agent) | Team (one project) | Global (everything)

### Working Memory (Kanban)
Tasks flow: `backlog → active → blocked → done → archived`
Working memory lives outside the context window. Survives compaction, surface switches, agent swaps.

### Model Routing Priority
1. Claude (Agent SDK, Max subscription) — primary, $0 flat
2. GLM 4.7 (Vercel AI SDK, z.ai) — fallback, $0 flat
3. Local Ollama (Vercel AI SDK, desktop 3080) — auxiliary tasks, $0
4. OpenRouter (Vercel AI SDK, $5 balance) — emergency only

## Development Guidelines

- Always activate virtual env / use correct Node version before running
- Use Drizzle migrations for all schema changes — never raw SQL DDL
- All memory operations go through the store layer, never direct DB access
- Hooks must be fast — offload expensive work to async queues
- Test memory operations with isolated SQLite databases (in-memory or temp files)
- Every fact needs provenance (source_session_id, source_type, extracted_by)
- Confidence scores are 0.0-1.0, decay rates are per-day floats
- Embeddings are generated locally via Ollama — never call external APIs for embeddings

## Important Constraints

- **Agent SDK ToS**: Assuming Max subscription personal use is permitted. If enforcement changes, fallback to API keys.
- **Local-first**: All data stays on the user's machine. SQLite single file. No cloud dependencies for core functionality.
- **No inference in the knowledge graph**: Relations are explicit, not derived. Pipeline 2 creates them, not graph algorithms.
- **Skills are files**: Stored as markdown on disk at `~/.agent/skills/`. Indexed in SQLite for search, but the source of truth is the file.
