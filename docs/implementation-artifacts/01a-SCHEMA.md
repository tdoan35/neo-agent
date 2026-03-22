# Phase 1a: Database Schema + Migrations

## Overview

Define all Drizzle ORM schemas for the 12 database tables, set up FTS5 full-text search, initialize sqlite-vec for vector storage, and create the database connection factory. This is the foundation — every subsequent phase depends on these schemas.

**Estimated effort**: 2-3 days

---

## Prerequisites

- Phase 0 complete (monorepo buildable, shared types exist)
- Install in `packages/memory`:
  - `drizzle-orm`, `better-sqlite3` (runtime)
  - `drizzle-kit`, `@types/better-sqlite3` (dev)
  - `sqlite-vec` (native addon for vector search)

---

## Dependency Graph

```
drizzle.config.ts
     ↓
schema/*.ts  (all 12 schema files, independent of each other)
     ↓
schema/index.ts  (barrel export)
     ↓
db.ts  (connection factory, runs migrations, loads extensions)
     ↓
FTS5 + sqlite-vec setup (custom SQL in db.ts)
```

All schema files can be written in parallel — they have no inter-dependencies at the Drizzle level. Foreign key relationships are defined within each schema file using string references.

---

## Implementation Units

### 1a.1 Drizzle Configuration

#### Files

- `packages/memory/drizzle.config.ts`

#### Implementation Notes

Configure `drizzle-kit` for SQLite:
- `schema`: point to `./src/schema/*.ts`
- `driver`: `better-sqlite3`
- `dbCredentials`: `{ url: process.env.DB_PATH || '~/.agent/memory.db' }`
- `out`: `./drizzle` (migration output directory)

---

### 1a.2 Schema Files

#### Files

All under `packages/memory/src/schema/`:

| File | Table | ARCHITECTURE.md Reference |
|------|-------|--------------------------|
| `containers.ts` | `containers` | §1.2 |
| `entities.ts` | `entities` | §1.3 |
| `facts.ts` | `facts` | §1.4 |
| `relations.ts` | `relations` | §1.5 |
| `entity-containers.ts` | `entity_containers` | §1.6 |
| `working-memory.ts` | `working_memory` | §1.7 |
| `session-logs.ts` | `session_logs` | §1.8 |
| `skills.ts` | `skills` | §1.9 |
| `embeddings.ts` | `embeddings` | §1.10 |
| `identities.ts` | `identities` | §1.11 |
| `batch-runs.ts` | `batch_runs` | §1.12 |
| `cron-jobs.ts` | `cron_jobs` | §6.3 |
| `index.ts` | Barrel export | — |

#### Schema Pattern

Each file exports a `sqliteTable()` definition. Example pattern (using `containers` as the reference):

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const containers = sqliteTable('containers', {
  id:          text('id').primaryKey(),
  paraType:    text('para_type').notNull(),    // 'project' | 'area' | 'resource' | 'archive'
  name:        text('name').notNull(),
  description: text('description'),
  outcome:     text('outcome'),                // For projects: defined outcome
  deadline:    text('deadline'),               // ISO date string
  status:      text('status').notNull().$defaultFn(() => 'active'),
  areaOfLife:  text('area_of_life'),
  parentId:    text('parent_id').references(() => containers.id),
  scope:       text('scope').notNull().$defaultFn(() => 'private'),
  ownerAgent:  text('owner_agent'),
  createdAt:   text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt:   text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  archivedAt:  text('archived_at'),
});
```

#### Column-to-Table Mapping

**containers** — 13 columns:
`id`, `para_type` (text, enum), `name` (text), `description` (text?), `outcome` (text?), `deadline` (text?), `status` (text, enum), `area_of_life` (text?), `parent_id` (text?, FK→containers), `scope` (text, enum), `owner_agent` (text?), `created_at` (text), `updated_at` (text), `archived_at` (text?)

**entities** — 13 columns:
`id`, `type` (text, enum), `name` (text), `aliases` (text, JSON array), `description` (text?), `container_id` (text?, FK→containers), `scope` (text), `project_id` (text?), `owner_agent` (text?), `source_session_id` (text?), `created_at` (text), `updated_at` (text), `last_accessed_at` (text?), `confidence` (real, default 1.0)

**facts** — 19 columns:
`id`, `entity_id` (text?, FK→entities), `container_id` (text?, FK→containers), `type` (text, enum), `content` (text), `structured` (text?, JSON), `scope` (text), `project_id` (text?), `owner_agent` (text?), `source_session_id` (text?), `source_type` (text, enum), `extracted_by` (text?), `created_at` (text), `updated_at` (text), `last_confirmed_at` (text?), `last_accessed_at` (text?), `expires_at` (text?), `confidence` (real), `decay_rate` (real, default 0.02), `supersedes_fact_id` (text?, FK→facts)

**relations** — 10 columns:
`id`, `source_entity_id` (text, FK→entities), `target_entity_id` (text, FK→entities), `type` (text, enum), `label` (text?), `directional` (integer, boolean, default 1), `scope` (text), `project_id` (text?), `created_at` (text), `updated_at` (text), `confidence` (real)

**entity_containers** — 4 columns:
`id`, `entity_id` (text, FK→entities), `container_id` (text, FK→containers), `role` (text?), `added_at` (text)

**working_memory** — 13 columns:
`id`, `agent_id` (text), `project_id` (text?), `title` (text), `state` (text, enum: backlog/active/blocked/done), `context` (text?, JSON), `decisions` (text, JSON array, default '[]'), `blockers` (text?), `open_questions` (text, JSON array, default '[]'), `handoff_summary` (text?), `scope` (text), `created_at` (text), `updated_at` (text), `completed_at` (text?)

**session_logs** — 13 columns:
`id`, `session_id` (text), `agent_id` (text), `project_id` (text?), `surface` (text?), `turn_index` (integer), `role` (text, enum), `content` (text), `tool_name` (text?), `tool_input` (text?, JSON), `model` (text?), `token_count` (integer?), `created_at` (text), `processed` (integer, boolean, default 0), `processed_at` (text?), `batch_run_id` (text?)

**skills** — 14 columns:
`id`, `name` (text), `description` (text?), `file_path` (text), `category` (text?), `tags` (text, JSON array, default '[]'), `related_entity_ids` (text, JSON array, default '[]'), `times_used` (integer, default 0), `last_used_at` (text?), `success_rate` (real?), `scope` (text), `project_id` (text?), `synthesized_from` (text?, JSON array), `created_at` (text), `updated_at` (text), `confidence` (real)

**embeddings** — 5 columns:
`id`, `source_type` (text, enum), `source_id` (text), `text_content` (text), `created_at` (text)

Note: The actual vector data lives in a sqlite-vec virtual table (see 1a.4), not in this Drizzle table. This table stores metadata. The `id` column is used to join with the virtual table.

**identities** — 12 columns:
`id`, `name` (text), `role` (text), `tone` (text), `avatar` (text, JSON), `persona` (text), `boundaries` (text, JSON array), `soul_path` (text), `is_preset` (integer, boolean), `created_from` (text?), `created_at` (text), `updated_at` (text)

**batch_runs** — 11 columns:
`id`, `trigger_type` (text, enum), `status` (text, enum), `sessions_processed` (integer), `facts_created` (integer), `facts_updated` (integer), `facts_archived` (integer), `entities_created` (integer), `skills_created` (integer), `model` (text), `started_at` (text), `completed_at` (text?), `error` (text?)

**cron_jobs** — 9 columns:
`id`, `name` (text), `schedule` (text, cron expression), `prompt` (text), `agent_id` (text), `deliver_to` (text), `enabled` (integer, boolean, default 1), `last_run_at` (text?), `next_run_at` (text), `created_at` (text)

#### Barrel Export

```typescript
// packages/memory/src/schema/index.ts
export { containers } from './containers.js';
export { entities } from './entities.js';
export { facts } from './facts.js';
export { relations } from './relations.js';
export { entityContainers } from './entity-containers.js';
export { workingMemory } from './working-memory.js';
export { sessionLogs } from './session-logs.js';
export { skills } from './skills.js';
export { embeddings } from './embeddings.js';
export { identities } from './identities.js';
export { batchRuns } from './batch-runs.js';
export { cronJobs } from './cron-jobs.js';
```

---

### 1a.3 FTS5 Full-Text Search

#### Implementation Notes

Drizzle cannot generate FTS5 virtual tables. This must be set up via raw SQL executed during database initialization.

**FTS5 virtual table** on `session_logs(content)`:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS session_logs_fts
USING fts5(content, content=session_logs, content_rowid=rowid);
```

**Triggers** to keep FTS in sync:

```sql
-- After INSERT
CREATE TRIGGER IF NOT EXISTS session_logs_ai AFTER INSERT ON session_logs BEGIN
  INSERT INTO session_logs_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- After UPDATE
CREATE TRIGGER IF NOT EXISTS session_logs_au AFTER UPDATE ON session_logs BEGIN
  INSERT INTO session_logs_fts(session_logs_fts, rowid, content) VALUES('delete', old.rowid, old.content);
  INSERT INTO session_logs_fts(rowid, content) VALUES (new.rowid, new.content);
END;

-- After DELETE
CREATE TRIGGER IF NOT EXISTS session_logs_ad AFTER DELETE ON session_logs BEGIN
  INSERT INTO session_logs_fts(session_logs_fts, rowid, content) VALUES('delete', old.rowid, old.content);
END;
```

These SQL statements are executed in `db.ts` after Drizzle migrations run.

---

### 1a.4 sqlite-vec Setup

#### Implementation Notes

**Loading the extension:**

```typescript
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const sqlite = new Database(dbPath);
sqliteVec.load(sqlite);
```

**Creating the vector virtual table:**

`nomic-embed-text` produces 768-dimensional vectors.

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings
USING vec0(
  id TEXT PRIMARY KEY,
  vector FLOAT[768]
);
```

**Querying** (cosine similarity via sqlite-vec):

```sql
SELECT id, distance
FROM vec_embeddings
WHERE vector MATCH ?
ORDER BY distance
LIMIT ?;
```

The `?` parameter is a serialized float array. sqlite-vec handles cosine distance internally.

**Relationship to `embeddings` table:**
- `embeddings` table (Drizzle-managed): stores metadata — `source_type`, `source_id`, `text_content`, timestamps
- `vec_embeddings` virtual table (raw SQL): stores the vector data, keyed by the same `id`
- Join on `embeddings.id = vec_embeddings.id` to get metadata + vector results together

---

### 1a.5 Database Connection Factory

#### Files

- `packages/memory/src/db.ts`

#### Key Interface

```typescript
import { drizzle } from 'drizzle-orm/better-sqlite3';

type DrizzleDB = ReturnType<typeof drizzle>;

function createDatabase(dbPath: string): DrizzleDB;
```

#### Implementation Notes

The `createDatabase` function:

1. Opens `better-sqlite3` connection at `dbPath` (or `:memory:` for tests)
2. Sets SQLite pragmas:
   - `PRAGMA journal_mode = WAL;` (write-ahead logging for concurrent reads)
   - `PRAGMA foreign_keys = ON;` (enforce FK constraints)
   - `PRAGMA busy_timeout = 5000;` (5s timeout for locked DB)
3. Loads sqlite-vec extension
4. Runs Drizzle migrations (via `migrate()` from `drizzle-orm/better-sqlite3/migrator`)
5. Executes raw SQL for FTS5 virtual table + triggers (1a.3)
6. Executes raw SQL for vec_embeddings virtual table (1a.4)
7. Returns configured Drizzle instance

For tests, pass `:memory:` — migrations and FTS5/vec setup still run, giving a fully functional in-memory database.

Export the `DrizzleDB` type for use by all store functions.

---

### 1a.6 Migration Generation

Run `drizzle-kit generate` to create the initial migration from all schema files.

```bash
pnpm --filter @neo-agent/memory exec drizzle-kit generate
```

This produces SQL migration files in `packages/memory/drizzle/`. The FTS5 and sqlite-vec setup is NOT part of Drizzle migrations — it's handled in `db.ts` initialization.

---

## Test Strategy

### Test File

- `packages/memory/tests/schema.test.ts`

### Test Cases

1. **Database creates and migrates**: Call `createDatabase(':memory:')`, verify no errors
2. **All tables exist**: Query `sqlite_master` for each of the 12 table names
3. **Column verification**: For at least 2-3 tables, verify columns match the schema (query `PRAGMA table_info(table_name)`)
4. **FTS5 works**: Insert a row into `session_logs`, query `session_logs_fts` with MATCH, verify result
5. **sqlite-vec works**: Verify `vec_embeddings` virtual table exists, insert a test vector, query by similarity
6. **Foreign keys enforced**: Try inserting a `fact` with a non-existent `entity_id`, verify it fails (FK constraint)
7. **Default values**: Insert a `container` with minimal fields, verify `status` defaults to `'active'`, `scope` defaults to `'private'`, timestamps are set
8. **JSON columns**: Insert an entity with `aliases` as JSON array, read back, verify it's the correct array

---

## Acceptance Criteria

- [ ] All 12 Drizzle schema files exist and type-check
- [ ] `drizzle-kit generate` produces a valid migration
- [ ] `createDatabase(':memory:')` succeeds — all tables, FTS5, and sqlite-vec ready
- [ ] FTS5 insert + MATCH query works
- [ ] sqlite-vec insert + similarity query works
- [ ] Foreign key constraints are enforced
- [ ] All schema tests pass

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `sqlite-vec` npm package may not exist or may be poorly maintained | Alternative: compile from source as a loadable extension, or use `better-sqlite3`'s `.loadExtension()` with a pre-built `.so`/`.dylib` |
| FTS5 triggers add overhead to every `session_logs` write | Acceptable for Pipeline 1 (session logs are appended infrequently relative to conversation pace). Monitor in Phase 2 if hook latency is an issue |
| Drizzle ORM may not support all SQLite features (e.g., `REAL` type for confidence) | Use `real('column_name')` from `drizzle-orm/sqlite-core` — it's supported |
| 768-dimension vectors may consume significant storage | nomic-embed-text vectors at 768 floats = ~3KB per embedding. At 10K facts this is ~30MB — acceptable for local SQLite |
