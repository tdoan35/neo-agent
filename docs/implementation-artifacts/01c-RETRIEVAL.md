# Phase 1c: Embeddings + Retrieval Engine

## Overview

Embedding generation via Ollama, vector storage/querying in sqlite-vec, and the retrieval engine that assembles context for injection into the agent's prompt. The retrieval engine is the core value delivery mechanism — it determines what the agent "remembers" on each turn.

**Estimated effort**: 3-4 days

---

## Prerequisites

- Phase 1a complete (sqlite-vec virtual table, `embeddings` metadata table)
- Phase 1b complete (store layer for querying facts, entities, skills, working memory)
- Ollama running locally with `nomic-embed-text` model pulled

---

## Dependency Graph

```
embeddings/generator.ts    (Ollama HTTP client)
         ↓
embeddings/index.ts        (sqlite-vec insert/query)
         ↓
retrieval/semantic.ts      (embed query → vec search → rank)
retrieval/keyword.ts       (FTS5 search)
retrieval/scoped.ts        (access scope filtering)
         ↓
retrieval/assembler.ts     (combine into injection blocks)
         ↓
retrieval/index.ts         (main assembleContext function)
```

---

## Implementation Units

### 1c.1 Embedding Generator

#### Files

- `packages/memory/src/embeddings/generator.ts`

#### Key Interface

```typescript
interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

interface OllamaEmbeddingConfig {
  baseUrl?: string;   // default: 'http://localhost:11434'
  model?: string;     // default: 'nomic-embed-text'
}

function createOllamaEmbeddingProvider(config?: OllamaEmbeddingConfig): EmbeddingProvider;
```

#### Implementation Notes

Calls Ollama's HTTP API:

```
POST http://localhost:11434/api/embed
Content-Type: application/json

{
  "model": "nomic-embed-text",
  "input": "text to embed"
}
```

Response:

```json
{
  "model": "nomic-embed-text",
  "embeddings": [[0.123, -0.456, ...]]  // 768 floats
}
```

- Convert response array to `Float32Array`
- `embedBatch` sends multiple inputs in a single request (Ollama supports array input)
- Error handling: throw `EmbeddingError` if Ollama is unreachable or model not loaded
- The `EmbeddingProvider` interface allows swapping to a different provider later (e.g., OpenAI embeddings API)

---

### 1c.2 Embedding Index

#### Files

- `packages/memory/src/embeddings/index.ts`

#### Key Interface

```typescript
function storeEmbedding(
  db: DrizzleDB,
  input: {
    sourceType: EmbeddingSource;
    sourceId: string;
    textContent: string;
    vector: Float32Array;
  }
): Promise<string>  // returns embedding id

function searchSimilar(
  db: DrizzleDB,
  queryVector: Float32Array,
  options?: {
    limit?: number;          // default: 10
    sourceTypes?: EmbeddingSource[];  // filter by source type
  }
): Promise<Array<{
  id: string;
  sourceType: EmbeddingSource;
  sourceId: string;
  textContent: string;
  distance: number;          // lower = more similar
}>>

function deleteEmbedding(db: DrizzleDB, id: string): Promise<void>
function deleteBySource(db: DrizzleDB, sourceType: EmbeddingSource, sourceId: string): Promise<void>
```

#### Implementation Notes

**storeEmbedding**:
1. Generate UUID for the embedding
2. Insert metadata into `embeddings` table (Drizzle)
3. Insert vector into `vec_embeddings` virtual table (raw SQL via `db.$client.prepare()`)
4. Both operations in a transaction

**searchSimilar**:
1. Query `vec_embeddings` with vector MATCH
2. Join with `embeddings` metadata table
3. Optionally filter by `source_type`
4. Return results ordered by distance (ascending = most similar first)

Raw SQL for similarity query:

```sql
SELECT e.id, e.source_type, e.source_id, e.text_content, v.distance
FROM vec_embeddings v
JOIN embeddings e ON e.id = v.id
WHERE v.vector MATCH ?
  AND v.k = ?
ORDER BY v.distance
```

The `?` parameters: first is the serialized query vector, second is the limit (k).

If `sourceTypes` filter is provided, add `AND e.source_type IN (...)`.

---

### 1c.3 Semantic Retrieval

#### Files

- `packages/memory/src/retrieval/semantic.ts`

#### Key Interface

```typescript
interface SemanticResult {
  id: string;
  sourceType: EmbeddingSource;
  sourceId: string;
  content: string;
  similarity: number;     // 0-1, higher = more similar (inverted distance)
  confidence: number;     // from the source record
  recencyDays: number;    // days since last activity
  score: number;          // composite ranking score
}

function semanticSearch(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  query: string,
  options?: {
    limit?: number;           // default: 20 (pre-ranking)
    finalLimit?: number;      // default: 10 (post-ranking)
    sourceTypes?: EmbeddingSource[];
    scope?: ScopeFilter;
  }
): Promise<SemanticResult[]>
```

#### Ranking Formula

```
score = similarity * confidence * recency_factor
```

Where:
- `similarity` = `1 - distance` (normalized to 0-1 from sqlite-vec output)
- `confidence` = the fact/entity/skill's current confidence score
- `recency_factor` = `1 / (1 + log(1 + days_since_last_access))` — logarithmic decay so recent items are boosted but old items aren't completely penalized

Steps:
1. Embed the query text
2. Search sqlite-vec for top-K candidates (generous K, e.g., 20)
3. For each candidate, look up the source record (fact/entity/skill) to get confidence and timestamps
4. Calculate composite score
5. Apply scope filtering (see 1c.4)
6. Re-rank by composite score
7. Return top `finalLimit` results

---

### 1c.4 Scoped Retrieval

#### Files

- `packages/memory/src/retrieval/scoped.ts`

#### Key Interface

```typescript
interface ScopeFilter {
  agentId: string;
  projectId?: string;
}

function filterByScope<T extends { scope: AccessScope; projectId?: string | null; ownerAgent?: string | null }>(
  items: T[],
  filter: ScopeFilter
): T[]
```

#### Scope Rules

Given `agentId` and optional `projectId`:

| Scope | Visible when... |
|-------|----------------|
| `global` | Always visible |
| `team` | `item.projectId === filter.projectId` (project must match) |
| `private` | `item.ownerAgent === filter.agentId` (agent must match) |

Items with `scope === 'team'` and no matching project are filtered out.
Items with `scope === 'private'` and no matching agent are filtered out.

---

### 1c.5 Keyword Retrieval

#### Files

- `packages/memory/src/retrieval/keyword.ts`

#### Key Interface

```typescript
interface KeywordResult {
  sessionLogId: string;
  sessionId: string;
  content: string;
  rank: number;       // FTS5 rank score
  createdAt: string;
}

function keywordSearch(
  db: DrizzleDB,
  query: string,
  options?: {
    limit?: number;     // default: 10
    sessionId?: string; // restrict to specific session
  }
): Promise<KeywordResult[]>
```

#### Implementation Notes

Uses FTS5 MATCH with BM25 ranking:

```sql
SELECT sl.id, sl.session_id, sl.content, rank
FROM session_logs_fts
JOIN session_logs sl ON sl.rowid = session_logs_fts.rowid
WHERE session_logs_fts MATCH ?
ORDER BY rank
LIMIT ?
```

FTS5 `rank` is negative (lower = better match), so order ascending.

---

### 1c.6 Context Assembler

#### Files

- `packages/memory/src/retrieval/assembler.ts`

#### Key Interface

```typescript
interface AssembledContext {
  workingMemory: string;     // Markdown block
  userProfile: string;       // Markdown block
  projectContext: string;    // Markdown block (empty if no active project)
  relevantKnowledge: string; // Markdown block
  availableSkills: string;   // Markdown block
  totalTokenEstimate: number;
}

interface TokenBudget {
  total: number;              // default: 2000
  workingMemory: number;      // default: 500
  userProfile: number;        // default: 300
  projectContext: number;     // default: 400
  relevantKnowledge: number;  // default: 600 (fills remaining)
  skills: number;             // default: 200
}

function assembleBlocks(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  projectId: string | null,
  prompt: string,
  options?: {
    mode: RetrievalMode;
    budget?: Partial<TokenBudget>;
  }
): Promise<AssembledContext>
```

#### Block Assembly by Mode

| Mode | Blocks Assembled |
|------|-----------------|
| `SessionStart` | All 5 blocks |
| `PostCompact` | All 5 blocks (rebuild after compaction) |
| `PerPrompt` | Blocks 4-5 only (relevantKnowledge + availableSkills) |
| `Heartbeat` | Block 1 only (workingMemory refresh) |

#### Block Content Sources

**Block 1: Working Memory**
- Source: `getBoard(db, agentId, projectId)` → `formatForInjection(board, budget.workingMemory)`
- Always injected (highest priority)

**Block 2: User Profile**
- Source: Query facts where `scope === 'global'` AND `type IN ('biographical', 'preference', 'environmental')`
- Sort by confidence descending
- Format as "About the user" section with bullet points

**Block 3: Project Context**
- Source: Active PARA container matching `projectId` + team-scoped decisions/conventions for that project
- Only assembled if `projectId` is non-null
- Format as "Current project: {name}" with description, outcome, key decisions

**Block 4: Relevant Knowledge**
- Source: `semanticSearch()` using the user's prompt as query
- Filter by scope (global + team for current project + private for this agent)
- Fill remaining token budget after blocks 1-3
- Format as "Relevant knowledge" with bullet points of fact content

**Block 5: Available Skills**
- Source: `semanticSearch()` for skills matching the prompt
- Metadata only (name + description), not full skill content
- Progressive disclosure: if agent activates a skill, full content loaded separately
- Format as "Available procedures" with skill name and one-line description

#### Token Estimation

Simple heuristic: `chars / 4` (rough approximation for English text with typical tokenizer).

```typescript
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

Each block is generated, then truncated to its token budget. Block 4 (relevant knowledge) gets the remaining budget after blocks 1, 2, 3, and 5 are sized.

---

### 1c.7 Retrieval Entry Point

#### Files

- `packages/memory/src/retrieval/index.ts`

#### Key Interface

```typescript
function assembleContext(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  projectId: string | null,
  prompt: string,
  options?: {
    mode?: RetrievalMode;    // default: 'PerPrompt'
    budget?: Partial<TokenBudget>;
  }
): Promise<string>
// Returns all assembled blocks concatenated as a single string for injection
```

This is the main entry point called by hooks (Phase 2) and the MCP server (Phase 1d). It calls `assembleBlocks` and concatenates the non-empty blocks with section separators.

#### Reinforcement on Retrieval

When a fact is included in the assembled context, call `touchFact(db, factId)` to:
- Update `lastAccessedAt` to now
- Boost confidence by 0.05 (capped at 1.0)

This implements the "retrieval reinforces memory" behavior from ARCHITECTURE.md §4.4.

---

## Test Strategy

### Test Files

- `packages/memory/tests/embeddings/generator.test.ts`
- `packages/memory/tests/embeddings/index.test.ts`
- `packages/memory/tests/retrieval/semantic.test.ts`
- `packages/memory/tests/retrieval/keyword.test.ts`
- `packages/memory/tests/retrieval/scoped.test.ts`
- `packages/memory/tests/retrieval/assembler.test.ts`

### Key Test Cases

**Embedding generator** (requires Ollama running):
- Generate embedding for a text string, verify it's a Float32Array of length 768
- Batch embedding for multiple strings, verify array of arrays
- Error when Ollama is not running → `EmbeddingError` thrown

**Embedding index**:
- Store an embedding, retrieve by similarity with the same text → distance should be very low
- Store multiple embeddings with distinct content, query with related text → most similar ranked first
- `deleteBySource` removes the correct embedding

**Semantic search**:
- Create 5 facts with embeddings, search for a related query → relevant facts ranked higher
- Scope filtering: create private + global facts, search as different agent → private facts from other agent not returned
- Ranking: fact with higher confidence scores higher than semantically similar fact with lower confidence

**Keyword search**:
- Insert session logs with distinct content, search for keyword → matching logs returned
- FTS5 ranking: more relevant matches ranked higher
- Limit parameter respected

**Scoped retrieval**:
- Global items visible to all agents
- Team items visible only when projectId matches
- Private items visible only when agentId matches

**Assembler**:
- Full assembly (SessionStart mode) produces all 5 blocks
- PerPrompt mode produces only blocks 4-5
- Heartbeat mode produces only block 1
- Token budget: total output stays within configured budget
- Empty project (no projectId) → block 3 is empty string
- Reinforcement: facts included in output have `lastAccessedAt` updated

### Mock Embedding Provider

For tests that don't need real embeddings (assembler, scoped), create a mock:

```typescript
function createMockEmbeddingProvider(): EmbeddingProvider {
  return {
    async embed(text: string): Promise<Float32Array> {
      // Deterministic hash-based mock: same text always produces same vector
      const hash = simpleHash(text);
      const vec = new Float32Array(768);
      for (let i = 0; i < 768; i++) {
        vec[i] = Math.sin(hash + i) * 0.5;
      }
      return vec;
    },
    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      return Promise.all(texts.map(t => this.embed(t)));
    }
  };
}
```

This allows testing the retrieval pipeline without Ollama running. Integration tests with real Ollama can be gated behind an env var.

---

## Acceptance Criteria

- [ ] Embedding generator connects to Ollama and produces 768-dim vectors
- [ ] Embeddings stored in sqlite-vec and retrievable by similarity
- [ ] Semantic search returns relevant results ranked by composite score
- [ ] Keyword search (FTS5) returns ranked results
- [ ] Scope filtering correctly isolates private/team/global
- [ ] Context assembler produces well-formatted markdown blocks
- [ ] Token budget is respected across all blocks
- [ ] Retrieval reinforcement (touch on access) works
- [ ] All retrieval tests pass (with mock provider for unit tests)

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Ollama latency for embedding generation (~50-100ms per embed) | Acceptable for per-prompt retrieval. Batch embeddings for bulk operations (Pipeline 2). Cache recent prompt embeddings if needed |
| sqlite-vec similarity search performance at scale | sqlite-vec is designed for this use case. At <100K vectors, sub-millisecond queries expected. Monitor and add HNSW index if needed |
| Token estimation (`chars/4`) is imprecise | Good enough for budget enforcement. Over-estimation is better than under — we'd rather inject slightly less than blow the context window |
| Ollama not running during development/tests | Mock provider for unit tests. Gate integration tests behind `OLLAMA_AVAILABLE=true` env var |
| Retrieval reinforcement loop: frequently accessed facts stay high confidence forever | The reinforcement boost (+0.05) is small relative to decay. Facts still need reconfirmation by Pipeline 2 to fully reset. If needed, cap max reinforcement boosts per day |
