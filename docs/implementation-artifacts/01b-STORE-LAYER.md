# Phase 1b: Store Layer + Working Memory State Machine

## Overview

CRUD operations for all 12 tables, plus the kanban working memory state machine. The store layer is the API boundary for all memory operations — no code outside `packages/memory` should use Drizzle directly.

**Estimated effort**: 3-4 days

---

## Prerequisites

- Phase 1a complete (all schemas, `createDatabase()` works, FTS5 + sqlite-vec ready)
- Shared types from `packages/shared` available

---

## Dependency Graph

```
Store modules (can be built in parallel):
  ├── store/containers.ts
  ├── store/entities.ts
  ├── store/facts.ts
  ├── store/relations.ts
  ├── store/entity-containers.ts
  ├── store/session-logs.ts
  ├── store/skills.ts
  ├── store/batch-runs.ts
  ├── store/cron-jobs.ts
  └── store/identities.ts
           ↓
working-memory/index.ts  (depends on store/working-memory.ts)
           ↓
store/index.ts  (barrel export of all stores)
```

All store modules follow the same pattern from `00-CONVENTIONS.md §0.8` and can be built in parallel. The working memory state machine wraps the working-memory store with additional business logic.

---

## Implementation Units

### 1b.1 Store Modules

#### Files

All under `packages/memory/src/store/`:

| File | Table | Key Operations |
|------|-------|----------------|
| `containers.ts` | `containers` | create, update, archive, getById, listByParaType, getChildren |
| `entities.ts` | `entities` | create, update, getById, findByAlias, listByType, listByContainer, listByScope |
| `facts.ts` | `facts` | create, update, supersede, getById, listByEntity, listByContainer, listByScope, searchByType |
| `relations.ts` | `relations` | create, getById, listBySourceEntity, listByTargetEntity, listByType |
| `entity-containers.ts` | `entity_containers` | link, unlink, listByEntity, listByContainer |
| `working-memory.ts` | `working_memory` | create, update, getById, listByAgent, listByProject, listByState |
| `session-logs.ts` | `session_logs` | append, getBySession, fullTextSearch, markAsProcessed, getUnprocessed |
| `skills.ts` | `skills` | create, update, incrementUsage, getById, listByCategory, listByTags, search |
| `embeddings.ts` | `embeddings` | createWithVector, getById, deleteBySource |
| `identities.ts` | `identities` | create, update, getById, getByName, listAll, listPresets |
| `batch-runs.ts` | `batch_runs` | create, updateStats, getLatest, getById |
| `cron-jobs.ts` | `cron_jobs` | create, update, enable, disable, listEnabled, getById, updateLastRun |
| `index.ts` | — | Barrel export |

#### Function Signatures

Each store exports functions following the convention. Key signatures per store:

**containers.ts**

```typescript
function createContainer(db: DrizzleDB, input: CreateContainerInput): Promise<Container>
function getContainer(db: DrizzleDB, id: string): Promise<Container>
function updateContainer(db: DrizzleDB, id: string, updates: UpdateContainerInput): Promise<Container>
function archiveContainer(db: DrizzleDB, id: string): Promise<Container>  // sets status='archived', archivedAt=now
function listContainers(db: DrizzleDB, filters?: { paraType?: ParaType; status?: ContainerStatus; scope?: AccessScope }): Promise<Container[]>
function getChildContainers(db: DrizzleDB, parentId: string): Promise<Container[]>
```

**entities.ts**

```typescript
function createEntity(db: DrizzleDB, input: CreateEntityInput): Promise<Entity>
function getEntity(db: DrizzleDB, id: string): Promise<Entity>
function updateEntity(db: DrizzleDB, id: string, updates: UpdateEntityInput): Promise<Entity>
function findEntityByAlias(db: DrizzleDB, alias: string, scope?: AccessScope): Promise<Entity | null>
function listEntities(db: DrizzleDB, filters?: { type?: EntityType; containerId?: string; scope?: AccessScope }): Promise<Entity[]>
function touchEntity(db: DrizzleDB, id: string): Promise<void>  // updates lastAccessedAt
```

**facts.ts**

```typescript
function createFact(db: DrizzleDB, input: CreateFactInput): Promise<Fact>
function getFact(db: DrizzleDB, id: string): Promise<Fact>
function updateFact(db: DrizzleDB, id: string, updates: UpdateFactInput): Promise<Fact>
function supersedeFact(db: DrizzleDB, oldFactId: string, newFactInput: CreateFactInput): Promise<Fact>  // creates new fact with supersedesFactId set
function listFacts(db: DrizzleDB, filters?: {
  entityId?: string;
  containerId?: string;
  scope?: AccessScope;
  type?: FactType;
  minConfidence?: number;
}): Promise<Fact[]>
function touchFact(db: DrizzleDB, id: string): Promise<void>  // updates lastAccessedAt, bumps confidence by 0.05
function confirmFact(db: DrizzleDB, id: string): Promise<void>  // resets confidence to 1.0, updates lastConfirmedAt
function applyDecay(db: DrizzleDB, factId: string, now: Date): Promise<Fact>  // calculates and applies decay
function bulkApplyDecay(db: DrizzleDB, now: Date): Promise<{ updated: number; archived: number; pruned: number }>
```

**relations.ts**

```typescript
function createRelation(db: DrizzleDB, input: CreateRelationInput): Promise<Relation>
function getRelation(db: DrizzleDB, id: string): Promise<Relation>
function listRelations(db: DrizzleDB, filters?: {
  sourceEntityId?: string;
  targetEntityId?: string;
  type?: RelationType;
}): Promise<Relation[]>
function deleteRelation(db: DrizzleDB, id: string): Promise<void>
```

**session-logs.ts**

```typescript
function appendLog(db: DrizzleDB, input: CreateSessionLogInput): Promise<SessionLogEntry>
function getSessionLogs(db: DrizzleDB, sessionId: string): Promise<SessionLogEntry[]>
function fullTextSearch(db: DrizzleDB, query: string, options?: { limit?: number }): Promise<SessionLogEntry[]>
function getUnprocessedLogs(db: DrizzleDB): Promise<SessionLogEntry[]>
function markAsProcessed(db: DrizzleDB, logIds: string[], batchRunId: string): Promise<void>
```

**Note on `fullTextSearch`**: Uses the FTS5 virtual table:

```sql
SELECT sl.* FROM session_logs sl
JOIN session_logs_fts fts ON sl.rowid = fts.rowid
WHERE session_logs_fts MATCH ?
ORDER BY rank
LIMIT ?;
```

**skills.ts**

```typescript
function createSkill(db: DrizzleDB, input: CreateSkillInput): Promise<Skill>
function updateSkill(db: DrizzleDB, id: string, updates: UpdateSkillInput): Promise<Skill>
function incrementUsage(db: DrizzleDB, id: string, success: boolean): Promise<void>  // bumps timesUsed, updates lastUsedAt, recalculates successRate
function listSkills(db: DrizzleDB, filters?: { category?: string; tags?: string[] }): Promise<Skill[]>
```

**working-memory.ts** (raw CRUD — state machine logic is in 1b.2)

```typescript
function createTask(db: DrizzleDB, input: CreateTaskInput): Promise<WorkingMemoryTask>
function getTask(db: DrizzleDB, id: string): Promise<WorkingMemoryTask>
function updateTask(db: DrizzleDB, id: string, updates: UpdateTaskInput): Promise<WorkingMemoryTask>
function listTasks(db: DrizzleDB, filters?: {
  agentId?: string;
  projectId?: string;
  state?: TaskState;
}): Promise<WorkingMemoryTask[]>
```

#### Input Type Pattern

Each store defines its own input types (not exported from shared — these are internal to the store layer):

```typescript
interface CreateContainerInput {
  paraType: ParaType;
  name: string;
  description?: string;
  outcome?: string;
  deadline?: string;
  status?: ContainerStatus;
  areaOfLife?: string;
  parentId?: string;
  scope?: AccessScope;
  ownerAgent?: string;
}

interface UpdateContainerInput {
  name?: string;
  description?: string;
  outcome?: string;
  deadline?: string;
  status?: ContainerStatus;
  areaOfLife?: string;
  parentId?: string;
  scope?: AccessScope;
}
```

#### JSON Column Handling

For columns like `aliases`, `decisions`, `tags`, `openQuestions`:

```typescript
// On write:
const row = {
  aliases: JSON.stringify(input.aliases ?? []),
  decisions: JSON.stringify(input.decisions ?? []),
};

// On read:
function deserializeEntity(row: typeof entities.$inferSelect): Entity {
  return {
    ...row,
    aliases: JSON.parse(row.aliases) as string[],
  };
}
```

Every store function that reads from the DB should run results through a deserializer.

---

### 1b.2 Working Memory State Machine

#### Files

- `packages/memory/src/working-memory/index.ts`
- `packages/memory/src/working-memory/transitions.ts`

#### Key Interfaces

```typescript
// Valid state transitions
const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  backlog: ['active'],
  active:  ['blocked', 'done'],
  blocked: ['active'],
  done:    [],  // Terminal state (Pipeline 2 archives)
};

interface TransitionMetadata {
  blockers?: string;        // Required when transitioning to 'blocked'
  completionNotes?: string; // Optional when transitioning to 'done'
}

// The full kanban board
interface KanbanBoard {
  active:  WorkingMemoryTask[];
  blocked: WorkingMemoryTask[];
  backlog: WorkingMemoryTask[];
  done:    WorkingMemoryTask[];
}
```

#### Function Signatures

```typescript
function transitionTask(
  db: DrizzleDB,
  taskId: string,
  toState: TaskState,
  metadata?: TransitionMetadata
): Promise<WorkingMemoryTask>
// Validates transition is legal, updates state + metadata, sets completedAt if done
// Throws InvalidStateTransitionError for illegal transitions
// Throws MemoryError if transitioning to 'blocked' without blockers

function getBoard(
  db: DrizzleDB,
  agentId: string,
  projectId?: string
): Promise<KanbanBoard>
// Returns all tasks grouped by state for the given agent/project

function formatForInjection(board: KanbanBoard, tokenBudget?: number): string
// Renders the kanban board as a markdown block for context injection
// Respects token budget (default ~500 tokens ≈ 2000 chars)
// Priority: active tasks first, then blocked (with reasons), then top 3 backlog
// Done tasks are never injected

function addDecision(
  db: DrizzleDB,
  taskId: string,
  decision: { content: string; timestamp: string }
): Promise<WorkingMemoryTask>
// Appends to the decisions JSON array

function addOpenQuestion(
  db: DrizzleDB,
  taskId: string,
  question: string
): Promise<WorkingMemoryTask>
// Appends to the openQuestions JSON array

function resolveOpenQuestion(
  db: DrizzleDB,
  taskId: string,
  questionIndex: number
): Promise<WorkingMemoryTask>
// Removes question at index from openQuestions array
```

#### formatForInjection Output Format

```markdown
## Working Memory

### Active
- **Fix token expiry bug in auth module**
  Context: src/auth/tokens.ts, branch: fix/token-expiry
  Decisions: [2] Use sliding window for refresh tokens
  Open questions: Should we invalidate existing tokens?

### Blocked
- **Update JWT dependencies** ⚠️
  Blocker: Waiting on security review approval

### Backlog
- Write migration tests
- Review API error handling
- Document auth flow
```

#### Business Rules

1. Transitioning to `blocked` **requires** a `blockers` string — throw if missing
2. Transitioning to `done` sets `completedAt` to now
3. Transitioning from `blocked` to `active` clears the `blockers` field
4. `done` is a terminal state — no transitions out (Pipeline 2 handles archival by deleting)
5. Multiple tasks can be `active` simultaneously (no single-active constraint)
6. `formatForInjection` truncates at the token budget — backlog items are cut first, then blocked details, then active details

---

### 1b.3 Decay Functions

#### File

- `packages/memory/src/store/facts.ts` (included in the facts store)

#### Implementation

```typescript
const DECAY_RATES: Record<string, number> = {
  area:           0.01,
  project_active: 0.03,
  project_done:   0.10,
  resource:       0.02,
  skill:          0.005,
};

function calculateDecay(fact: Fact, now: Date): number {
  const lastActivity = new Date(
    Math.max(
      new Date(fact.lastConfirmedAt ?? fact.createdAt).getTime(),
      new Date(fact.lastAccessedAt ?? fact.createdAt).getTime()
    )
  );
  const daysSinceActivity = (now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24);

  // Power law decay (Ebbinghaus-inspired)
  return Math.max(0, fact.confidence * Math.pow(1 - fact.decayRate, daysSinceActivity));
}
```

`bulkApplyDecay` iterates all non-archived facts, applies the formula, and:
- Facts dropping below 0.1 → set scope to `'archive'`
- Facts dropping below 0.01 → delete entirely (pruned)
- Returns count of updated, archived, and pruned

---

## Test Strategy

### Test Files

- `packages/memory/tests/store/containers.test.ts`
- `packages/memory/tests/store/entities.test.ts`
- `packages/memory/tests/store/facts.test.ts`
- `packages/memory/tests/store/relations.test.ts`
- `packages/memory/tests/store/session-logs.test.ts`
- `packages/memory/tests/store/skills.test.ts`
- `packages/memory/tests/store/working-memory.test.ts`
- `packages/memory/tests/working-memory/state-machine.test.ts`

### Key Test Cases Per Store

**All stores** should test:
1. Create → verify returned object has all fields, timestamps set, ID generated
2. Get by ID → verify match, verify `NotFoundError` on invalid ID
3. Update → verify only specified fields changed, `updatedAt` bumped
4. List with filters → verify filtering works correctly
5. Scope filtering → verify private/team/global isolation

**entities.ts** additional:
- `findByAlias`: create entity with aliases `["Alice", "the frontend lead"]`, find by each alias
- `findByAlias` with scope filtering

**facts.ts** additional:
- `supersedeFact`: create fact A, supersede with fact B, verify B.supersedesFactId === A.id, verify A still exists
- `touchFact`: verify `lastAccessedAt` updated and confidence bumped by 0.05, capped at 1.0
- `confirmFact`: verify confidence reset to 1.0, `lastConfirmedAt` updated
- `applyDecay`: create fact with known confidence and decay rate, apply decay after simulated time, verify new confidence
- `bulkApplyDecay`: create facts with varying confidence, verify archival and pruning thresholds

**session-logs.ts** additional:
- `fullTextSearch`: insert logs with distinct content, search for keyword, verify matches
- `markAsProcessed`: mark batch, verify `processed` flag and `batchRunId` set
- `getUnprocessed`: verify only unprocessed logs returned

**working-memory state machine**:
- All valid transitions: backlog→active, active→blocked, blocked→active, active→done
- Invalid transitions: backlog→blocked, backlog→done, done→active, done→blocked
- Blocked requires blockers: verify error thrown without blockers string
- Done sets completedAt
- `getBoard`: create tasks in different states, verify grouping
- `formatForInjection`: verify markdown output format, verify token budget truncation
- `addDecision`/`addOpenQuestion`: verify JSON array appends correctly
- `resolveOpenQuestion`: verify removal at index

### Test Fixtures

Use `createDatabase(':memory:')` per test (or per test file with `beforeEach` reset). No shared state between tests.

---

## Acceptance Criteria

- [ ] All 12 store modules exist with full CRUD operations
- [ ] All store functions use `DrizzleDB` as first parameter, return shared types
- [ ] JSON columns serialize/deserialize correctly
- [ ] Working memory state machine validates all transitions
- [ ] Invalid transitions throw `InvalidStateTransitionError`
- [ ] `formatForInjection` produces readable markdown within token budget
- [ ] Decay formula correctly calculates confidence degradation
- [ ] `bulkApplyDecay` archives and prunes at correct thresholds
- [ ] FTS5 search via `fullTextSearch` returns ranked results
- [ ] All store tests pass

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| FTS5 MATCH query performance on large session logs | Add `LIMIT` to all FTS queries. Consider periodic `INSERT INTO session_logs_fts(session_logs_fts) VALUES('optimize')` |
| JSON column parsing errors on malformed data | Wrap `JSON.parse` in try/catch in deserializers, log warning and return default value |
| `bulkApplyDecay` on large fact sets could be slow | Run in a transaction. If >10K facts, batch in chunks of 1000 |
| Multiple concurrent writers to SQLite | WAL mode (set in db.ts) allows concurrent reads. Writes are serialized by SQLite — acceptable for single-user local app |
