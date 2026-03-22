# Phase 4: Batch "Dream" Processing Pipeline

## Overview

Pipeline 2 — the batch consolidation system that processes accumulated session logs into durable knowledge. It extracts facts, resolves entities, detects contradictions, synthesizes skills, applies decay, and manages the lifecycle of memory. This is the second core differentiator (alongside the hook-driven real-time capture).

**Estimated effort**: 7-10 days

---

## Prerequisites

- Phase 2 complete (session logs being written by hooks, working memory operational)
- Phase 1 complete (all stores, retrieval engine, embeddings)
- Ollama running with `qwen3:8b` (or larger model for better extraction quality)
- Optional: Claude via Agent SDK for higher-quality extraction (configurable)

---

## Dependency Graph

```
packages/memory/src/consolidation/
  runner.ts          (orchestrates all stages)
       ↓
  stages/
    01-episodic-replay.ts      (read + parse session logs)
    02-para-classify.ts        (assign to PARA containers)
    03-semantic-integrate.ts   (entity resolution, dedup, contradictions)
    04-skill-synthesize.ts     (create skills from successful tasks)
    05-lifecycle-manage.ts     (decay, archive, prune, promote)
    06-record-keeping.ts       (batch_runs stats)
       ↓
  prompts/
    extraction.ts              (LLM prompt templates)
    classification.ts
    entity-resolution.ts
    skill-synthesis.ts
  index.ts                     (public API)
```

Stages run sequentially (each depends on the previous).

---

## Implementation Units

### 4.1 Pipeline Runner

#### Files

- `packages/memory/src/consolidation/runner.ts`

#### Key Interface

```typescript
interface PipelineConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  llmCall: (prompt: string) => Promise<string>;  // Abstracted LLM call
  triggerType: BatchTrigger;
}

interface PipelineResult {
  batchRunId: string;
  sessionsProcessed: number;
  factsCreated: number;
  factsUpdated: number;
  factsArchived: number;
  entitiesCreated: number;
  skillsCreated: number;
  duration: number;  // ms
}

async function runPipeline(config: PipelineConfig): Promise<PipelineResult>
```

#### Implementation Notes

1. Create a `batch_runs` record with status `'running'`
2. Get all unprocessed session logs
3. If no unprocessed logs, mark run as completed with zero stats and return
4. Run stages 1-6 sequentially, accumulating stats
5. Update `batch_runs` record with final stats and status `'completed'`
6. On error: update `batch_runs` with status `'failed'` and error message

**LLM abstraction:**

The `llmCall` parameter allows the pipeline to work with any model:
- Default: Ollama qwen3:8b via HTTP
- Optional: Claude via Agent SDK (for higher quality, at cost of Max quota)
- Test: Mock function that returns predetermined JSON

---

### 4.2 Stage 1: Episodic Replay

#### Files

- `packages/memory/src/consolidation/stages/01-episodic-replay.ts`

#### Key Interface

```typescript
interface SessionSummary {
  sessionId: string;
  agentId: string;
  projectId: string | null;
  turns: SessionTurn[];
  toolsUsed: string[];
  startedAt: string;
  endedAt: string;
}

interface SessionTurn {
  turnIndex: number;
  role: TurnRole;
  content: string;
  toolName?: string;
  toolInput?: unknown;
}

interface ExtractionInput {
  sessions: SessionSummary[];
  logIds: string[];  // IDs of all processed logs (for marking)
}

async function replayEpisodes(db: DrizzleDB): Promise<ExtractionInput>
```

#### Implementation Notes

1. Query `getUnprocessedLogs(db)` — returns all session log entries where `processed === false`
2. Group by `session_id`
3. Order each group by `turn_index`
4. Parse into `SessionSummary` objects
5. Extract tool usage patterns (which tools were used in each session)
6. Return the structured data for subsequent stages

---

### 4.3 Stage 2: PARA Classification

#### Files

- `packages/memory/src/consolidation/stages/02-para-classify.ts`
- `packages/memory/src/consolidation/prompts/classification.ts`

#### Key Interface

```typescript
interface ClassifiedItem {
  content: string;
  type: FactType;
  containerId: string;
  containerName: string;
  isNewContainer: boolean;
  entityName?: string;
  confidence: number;
}

async function classifyItems(
  db: DrizzleDB,
  llmCall: LlmCall,
  sessions: SessionSummary[]
): Promise<ClassifiedItem[]>
```

#### LLM Prompt Template

```
You are analyzing conversation sessions to classify extracted knowledge.

Existing PARA containers:
${containerList}

For each session, extract facts, decisions, and observations, and assign each to the most appropriate container.

Sessions:
${sessionSummaries}

For each extracted item, return:
- content: the fact/decision/observation text
- type: one of [preference, decision, convention, status, capability, biographical, environmental, observation, lesson_learned, goal, blocker]
- containerName: which PARA container this belongs to (existing name or suggest a new one)
- entityName: if this relates to a specific entity (person, tool, service), name it
- confidence: 0.0-1.0 how confident you are in this extraction

Return as JSON array.
```

#### Implementation Notes

- Batch sessions (e.g., 3-5 at a time) to avoid overwhelming the LLM context
- For each classified item, check if the container exists by name matching
- If container doesn't exist, create a new one with inferred `paraType`:
  - Contains "project", deadline, outcome → `'project'`
  - Ongoing responsibility → `'area'`
  - Reference material → `'resource'`
  - Default: `'area'`

---

### 4.4 Stage 3: Semantic Integration

#### Files

- `packages/memory/src/consolidation/stages/03-semantic-integrate.ts`
- `packages/memory/src/consolidation/prompts/entity-resolution.ts`

#### Key Interface

```typescript
interface IntegrationResult {
  factsCreated: Fact[];
  factsUpdated: Fact[];
  entitiesCreated: Entity[];
  entitiesLinked: number;       // existing entities matched
  contradictions: Array<{ oldFact: Fact; newFact: Fact }>;
  relationsCreated: Relation[];
}

async function integrateSemantics(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  llmCall: LlmCall,
  items: ClassifiedItem[]
): Promise<IntegrationResult>
```

#### Sub-steps

**3a. Entity Resolution:**
For each `entityName` in classified items:
1. Check `findEntityByAlias(db, name)` — exact alias match
2. If no match, check semantic similarity: embed the name, search existing entity embeddings
3. If similarity > 0.90, treat as same entity (update aliases)
4. If ambiguous (0.75-0.90), use LLM to confirm:

```
Is "{newName}" the same entity as "{existingName}" ({existingType})?
Context: {surrounding text from the session}
Respond: YES or NO with brief reason.
```

5. If no match found, create new entity

**3b. Fact Deduplication:**
For each new fact:
1. Embed the fact content
2. Search existing fact embeddings for similarity > 0.95
3. If near-duplicate found, skip creation (or merge — update confidence)
4. If unique, create the fact

**3c. Contradiction Detection:**
For each new fact:
1. Query existing facts with same `entityId` AND same `type`
2. If found and content differs significantly:
   - Newer fact supersedes older: `supersedeFact(db, oldFactId, newFactInput)`
   - Old fact remains but with `supersedesFactId` pointing to new
3. "Differs significantly": use LLM if unsure:

```
Do these two facts contradict each other?
Fact A (from {dateA}): "{contentA}"
Fact B (from {dateB}): "{contentB}"
Respond: CONTRADICTS, UPDATES, or COMPATIBLE
```

**3d. Relation Creation:**
Entities mentioned together in the same decision or context → create typed relation:
- Tool used in project → `uses` relation
- Person works on project → `works_on` relation
- Service depends on another → `depends_on` relation

Use LLM to classify the relation type if not obvious from context.

**3e. Embedding Generation:**
Generate embeddings for all newly created facts and entities.

---

### 4.5 Stage 4: Skill Synthesis

#### Files

- `packages/memory/src/consolidation/stages/04-skill-synthesize.ts`
- `packages/memory/src/consolidation/prompts/skill-synthesis.ts`

#### Key Interface

```typescript
interface SynthesizedSkill {
  name: string;
  description: string;
  filePath: string;       // Written to ~/.agent/skills/
  category: string;
  tags: string[];
  relatedEntityIds: string[];
  synthesizedFrom: string[];  // Session IDs
}

async function synthesizeSkills(
  db: DrizzleDB,
  llmCall: LlmCall,
  sessions: SessionSummary[]
): Promise<SynthesizedSkill[]>
```

#### Implementation Notes

**Skill-worthy session heuristic:**
1. A task moved from `active` to `done` during this session
2. The session involved 3+ distinct tool calls
3. The session was longer than 5 turns
4. The task was NOT marked as a failure

If all conditions met, call LLM to synthesize:

```
A multi-step task was completed successfully in this session.

Task: {taskTitle}
Tools used: {toolList}
Session summary: {truncatedSessionContent}

Extract the procedure as a reusable skill:
- name: short name for this procedure
- description: one sentence
- steps: numbered list of what was done
- tools: which tools are required
- category: one of [devops, debugging, setup, workflow, data, documentation]
- tags: relevant keywords

Return as JSON.
```

Write the skill as a markdown file to `~/.agent/skills/{slugified-name}.md`:

```markdown
# {name}

{description}

## Steps

1. {step 1}
2. {step 2}
...

## Tools Required

- {tool1}
- {tool2}

## Tags

{tag1}, {tag2}
```

Index in the `skills` table with metadata + generate embedding.

---

### 4.6 Stage 5: Lifecycle Management

#### Files

- `packages/memory/src/consolidation/stages/05-lifecycle-manage.ts`

#### Key Interface

```typescript
interface LifecycleResult {
  decayed: number;
  archived: number;
  pruned: number;
  promoted: number;
  projectsCompleted: number;
}

async function manageLifecycle(db: DrizzleDB): Promise<LifecycleResult>
```

#### Sub-steps

**5a. Decay Pass:**
- Call `bulkApplyDecay(db, new Date())`
- Uses the decay formula from `01b-STORE-LAYER.md §1b.3`

**5b. Archive Pass:**
- Facts below confidence 0.1 → set scope to `'archive'`
- These are still queryable but never auto-injected

**5c. Prune Pass:**
- Facts below confidence 0.01 → delete entirely
- Also delete associated embeddings

**5d. Project Completion Check:**
- Query all project containers
- Check if all tasks for a project are in `done` state
- If yes, run final consolidation:
  - Extract the most important decisions and lessons learned
  - Promote them from `team` to `global` scope
  - Archive the project container

**5e. Promotion Pass:**
- Identify team-scoped facts that appear across multiple projects
- If a fact (same content, same entity) exists in 2+ project containers → promote to `global`
- Promotion: create new global fact, keep project facts as-is

---

### 4.7 Stage 6: Record Keeping

#### Files

- `packages/memory/src/consolidation/stages/06-record-keeping.ts`

#### Implementation Notes

1. Update the `batch_runs` record with final stats:
   - `sessions_processed`, `facts_created`, `facts_updated`, `facts_archived`, `entities_created`, `skills_created`
   - `status: 'completed'`, `completed_at: now`
2. Mark all processed session logs with `batch_run_id`
3. Log a summary (for debugging):

```
Dream processing complete:
  Sessions processed: 5
  Facts created: 12, updated: 3, archived: 7
  Entities created: 2
  Skills created: 1
  Duration: 45s
```

---

### 4.8 Pipeline Triggers

Three trigger paths (all call `runPipeline()`):

1. **Cron**: The built-in `nightly-dream` cron job fires at 2am → calls `runPipeline({ triggerType: 'cron' })`
2. **Session count**: The hourly `session-count-check` cron job queries unprocessed log count. If > 5 → calls `runPipeline({ triggerType: 'session_count' })`
3. **Manual**: `/dream` command or `memory_dream` MCP tool → calls `runPipeline({ triggerType: 'manual' })`

Wire the `memory_dream` MCP tool (from Phase 1d) to actually call `runPipeline` now.

---

## Test Strategy

### Test Files

- `packages/memory/tests/consolidation/runner.test.ts`
- `packages/memory/tests/consolidation/episodic-replay.test.ts`
- `packages/memory/tests/consolidation/para-classify.test.ts`
- `packages/memory/tests/consolidation/semantic-integrate.test.ts`
- `packages/memory/tests/consolidation/skill-synthesize.test.ts`
- `packages/memory/tests/consolidation/lifecycle-manage.test.ts`

### Test Fixtures

Create a set of fixture session logs that simulate realistic conversations:

```typescript
const fixtureSession = {
  sessionId: 'test-session-1',
  logs: [
    { role: 'user', content: 'Can you review the auth module?' },
    { role: 'assistant', content: 'I'll look at the token refresh logic...' },
    { role: 'tool', content: '{ "tool": "Read", "input": "src/auth/tokens.ts" }' },
    { role: 'assistant', content: 'I found an issue with token expiry...' },
    // ...
  ]
};
```

### Key Test Cases

**Pipeline runner:**
- No unprocessed logs → completes immediately with zero stats
- With fixture logs → all stages run, batch_runs record created
- Error in stage 3 → batch_runs status = 'failed', error recorded

**Episodic replay:**
- Groups logs by session correctly
- Orders turns by index
- Returns structured SessionSummary objects

**PARA classification** (with mock LLM):
- Items classified into existing containers by name match
- New container suggested when no match → container created
- Mock LLM returns valid JSON → items classified

**Semantic integration** (with mock LLM + mock embeddings):
- Entity resolution: same entity mentioned with different names → linked via alias
- Fact deduplication: near-identical facts → only one stored
- Contradiction: conflicting facts → newer supersedes older
- New relations created between co-mentioned entities

**Skill synthesis** (with mock LLM):
- Session with completed task → skill file created on disk
- Session without completed task → no skill created
- Skill indexed in DB with metadata

**Lifecycle management:**
- Decay: fact with 0.5 confidence and 0.1 decay rate after 10 days → confidence reduced
- Archive: fact below 0.1 confidence → archived
- Prune: fact below 0.01 confidence → deleted
- Promotion: team fact appearing in 2+ projects → promoted to global

---

## Acceptance Criteria

- [ ] `/dream` command triggers full pipeline run
- [ ] Cron trigger fires at scheduled time
- [ ] Session count trigger fires when threshold exceeded
- [ ] Pipeline processes all unprocessed session logs
- [ ] Facts extracted from session content with correct types
- [ ] Entities resolved (alias matching + LLM confirmation)
- [ ] Duplicate facts detected and skipped
- [ ] Contradictions detected and resolved (supersession)
- [ ] Skills synthesized from successful multi-step tasks
- [ ] Skill files written to disk as markdown
- [ ] Decay reduces confidence according to formula
- [ ] Facts below 0.1 archived, below 0.01 pruned
- [ ] Project completion detected, durable facts promoted
- [ ] Batch run stats recorded
- [ ] All processed logs marked with batch_run_id
- [ ] All tests pass

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM extraction quality varies with model | Use qwen3:8b for speed, allow Claude override for quality. Validate LLM JSON output (parse with try/catch, retry on malformed) |
| LLM JSON output may be malformed | Wrap JSON.parse in try/catch. Retry with clearer prompt. If still fails, log warning and skip item |
| Pipeline takes too long for many sessions | Batch sessions (process 5 at a time). Add progress tracking to batch_runs. Allow cancellation |
| Entity resolution false positives (merging distinct entities) | High similarity threshold (0.90). LLM confirmation for ambiguous cases. Allow manual correction later |
| Skill synthesis too aggressive (creating skills from trivial tasks) | Heuristic: require 3+ tool calls + 5+ turns + completed task. Adjust thresholds based on experience |
| Decay too aggressive / not aggressive enough | Default rates from ARCHITECTURE.md. Make rates configurable per container type. Monitor and adjust |
| Race condition: pipeline runs while user is in active session | Pipeline reads unprocessed logs (immutable). New logs written during pipeline won't be marked as processed. Safe |
