# Decision Record

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-21 | Build custom, not extend OpenClaw/Hermes | Memory layer IS the product; existing frameworks' memory opinions conflict with ours. OpenClaw's session management and compaction were the original pain points. Hermes is Python (we chose TypeScript). |
| 2026-03-21 | TypeScript | Agent SDK native, single language across stack, Vercel AI SDK is TS-native |
| 2026-03-21 | Agent SDK primary, Vercel AI SDK secondary | Full 18-event hook system for Claude path (PostCompact is critical for compaction fix). Vercel AI SDK provides model-agnostic fallback. |
| 2026-03-21 | SQLite + Drizzle + sqlite-vec | Local-first, zero infrastructure, single file, portable. Against Postgres (overkill for single user). Against external vector DBs (adds latency, cost, dependency). |
| 2026-03-21 | PARA × Brain memory model | PARA provides organizational intelligence (where things go, lifecycle). Brain taxonomy provides processing logic (how to consolidate, what decays). Neither alone is sufficient. |
| 2026-03-21 | Kanban working memory | Tasks flow through states (backlog→active→blocked→done). More powerful than a simple task blob for multi-agent handoffs. Survives compaction + surface switches. |
| 2026-03-21 | Two-pipeline architecture | Pipeline 1 (real-time, deterministic hooks) + Pipeline 2 (nightly batch "dream"). No existing competitor does both. Real-time must be fast/cheap. Batch has hindsight and can be expensive. |
| 2026-03-21 | Batch trigger: cron + session count + manual | Both automatic triggers (whichever fires first) plus `/dream`. Brain science suggests delay between experience and consolidation is valuable. |
| 2026-03-21 | Medium knowledge graph | Typed relations between entities but no inference engine. Relations are explicit (Pipeline 2 creates them), not transitively computed. 80% of value for 20% of complexity. |
| 2026-03-21 | Three-tier scoping | Private (per-agent) / Team (per-project) / Global (everything). With promotion rules managed by Pipeline 2. Solves the cross-scope memory silo problem. |
| 2026-03-21 | TUI first, no mobile gateway initially | Iterate on memory system fast without messaging platform complexity. Gateway daemon architecture supports adding channels later. |
| 2026-03-21 | Gateway daemon + cron + process mgmt | Core platform features borrowed from OpenClaw/Hermes analysis. Gateway is the spine — hosts MCP server, cron, process manager, channels. |
| 2026-03-21 | Agent identity via SOUL.md + presets | Customizable personalities with structured properties (name, role, tone, persona, boundaries). Presets for quick start (Dana, Carlos, Yuki, Aria). |
| 2026-03-21 | Card-based agent builder canvas | Three decks: Identity, Skills/Tools, Context. Visual character-selection metaphor. Onboarding wizard seeds user profile first. |
| 2026-03-21 | Not using Mem0, Mastra OM, or Letta | None provide PARA organization + two-pipeline architecture + deterministic capture together. Mem0 is closest (drop-in memory) but lacks working memory kanban, PARA, batch consolidation, and cross-project scoping. |
| 2026-03-21 | Aura Obsidian design system | Dark theme (#111319), blue/purple accents, Manrope/Inter typography, glassmorphism, no-line boundaries. Created in Google Stitch. |

---

## Competitive Landscape (as of March 2026)

### Why Not Mem0?
- Framework-agnostic memory layer, $24M funded, Apache 2.0
- Strengths: easy integration (3 lines of code), vector + graph hybrid, decay + confidence
- **Missing**: No PARA organization, no working memory/kanban, no two-pipeline architecture, no deterministic hook-driven capture, no cross-project scoping with permissions
- Could be used as a component but would fight against its opinions on storage (Postgres) and extraction (LLM-passive)

### Why Not Mastra Observational Memory?
- TypeScript framework (from Gatsby team), text-based observation compression
- Strengths: Excellent context compression (5-40×), prompt caching friendly, Observer + Reflector agents
- **Missing**: No PARA, no structured knowledge graph, "down with knowledge graphs" is explicitly their philosophy (text-only), no batch pipeline with hindsight, tightly coupled to Mastra framework
- Their anti-structured-data stance is philosophically opposed to our typed entity/fact/relation model

### Why Not Letta (MemGPT)?
- Full agent runtime, OS-inspired memory tiers, self-editing memory
- Strengths: Most sophisticated memory architecture among competitors, agent manages its own memory
- **Missing**: LLM-driven memory management (non-deterministic), no PARA organization, high lock-in (agents must run inside Letta), no batch consolidation pipeline
- The self-editing approach means memory quality depends entirely on model judgment

### Why Not Claude Code /dream?
- Anthropic's own background memory consolidation (feature-flagged, in staged rollout)
- Strengths: Integrated into Claude Code, reflective batch processing concept
- **Missing**: Writes to flat MEMORY.md (unstructured), no working memory, no cross-scope, no knowledge graph, no PARA, LLM-driven consolidation

### Our Differentiation (Three Things No Competitor Has Together)
1. **PARA as organizational primitive** — lifecycle-aware containers that determine how memories age and where they go
2. **Two-pipeline separation** — deterministic real-time capture (hooks) + reflective batch consolidation (dream) as distinct systems
3. **Deterministic capture + structured storage** — hooks capture everything regardless of LLM judgment, into typed schemas (entities, facts, relations)

---

## Key Technical References

### Agent SDK Hooks (18 events)
`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `UserPromptSubmit`, `SessionStart`, `SessionEnd`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Notification`, `PermissionRequest`, `Setup`, `TeammateIdle`, `TaskCompleted`, `ConfigChange`, `WorktreeCreate`, `WorktreeRemove`

### Critical hooks for memory system
- `SessionStart` → load working memory + KB
- `UserPromptSubmit` → semantic retrieval per-prompt
- `PostToolUse` → deterministic session logging + rule-based extraction
- `PreCompact` → snapshot working memory before compression
- `PostCompact` → re-inject working memory after compression
- `Stop` → end-of-turn LLM extraction + flush

### Hardware (for local inference)
- CPU: AMD 9800x3d
- GPU: RTX 3080 (10GB VRAM)
- RAM: 64GB
- Can run: 7-14B models fully on GPU, up to ~32B with CPU offload
- Recommended models: qwen3:8b (extraction), nomic-embed-text (embeddings)

### Subscriptions
- Claude Max ($100-200/mo) — primary agent, flat rate
- GLM 4.7 via z.ai — fallback agent, flat rate
- OpenRouter ($5 balance) — emergency only, pay-per-token

---

## Open Questions

### Architecture
- Agent SDK + Max subscription ToS: monitor Anthropic policy updates
- Gateway daemon: single process with subsystems vs multiple processes with IPC?
- TUI framework: Ink vs Blessed vs raw ANSI?

### Memory Layer
- Working memory injection: all active tasks or top N?
- Retrieval token budget: fixed 2000 tokens or adaptive?
- Skill creation threshold: what heuristic for "skill-worthy session"?
- Obsidian vault sync: bidirectional PARA ↔ Obsidian? (separate project scope)

### UX
- TUI agent builder: simplified wizard first, full canvas in web GUI?
- Agent config hot-reload: change identity/tools mid-session or require restart?
- Memory Palace: what does the KB browser look like?
