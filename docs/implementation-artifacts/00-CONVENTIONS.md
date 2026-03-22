# Phase 0: Monorepo Scaffolding + Conventions

## Overview

Everything needed before Phase 1 can begin: pnpm monorepo structure, TypeScript configuration, shared types, test framework, and the canonical patterns that all subsequent phases follow.

**Estimated effort**: 1-2 days

---

## Prerequisites

- Node.js ≥ 22 installed
- pnpm ≥ 9 installed
- Ollama installed with `nomic-embed-text` and `qwen3:8b` models pulled

---

## 0.1 pnpm Workspace

### Files to Create

- `pnpm-workspace.yaml`
- Root `package.json` (update existing)

### Structure

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
```

Root `package.json` should define:
- `"type": "module"`
- `"private": true`
- Workspace scripts: `build`, `test`, `lint`, `db:generate`, `db:migrate`
- Shared devDependencies: `typescript`, `vitest`, `tsx`, `drizzle-kit`
- Move existing `@anthropic-ai/claude-agent-sdk` and `dotenv` to root

### Package Layout Convention

Every package under `packages/` follows this structure:

```
packages/{name}/
  package.json          # "type": "module", name: "@neo-agent/{name}"
  tsconfig.json         # Extends root tsconfig.base.json
  src/
    index.ts            # Barrel export
  tests/
    *.test.ts
```

Each package's `package.json`:
- `"name": "@neo-agent/{name}"`
- `"type": "module"`
- `"main": "./src/index.ts"` (for dev; build step can change later)
- `"exports": { ".": "./src/index.ts" }`

---

## 0.2 TypeScript Configuration

### Files to Create

- `tsconfig.base.json` (root)
- `packages/{name}/tsconfig.json` (per package)

### Root tsconfig.base.json

Key settings:
- `"target": "ES2024"` (Node 22 supports all ES2024 features)
- `"module": "nodenext"`
- `"moduleResolution": "nodenext"`
- `"strict": true`
- `"skipLibCheck": true`
- `"esModuleInterop": true`
- `"resolveJsonModule": true`
- `"declaration": true`
- `"declarationMap": true`
- `"sourceMap": true`
- `"outDir": "./dist"`
- `"rootDir": "./src"`

Per-package tsconfig extends the base:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

### Path Aliases

Use workspace protocol (`@neo-agent/shared`) for cross-package imports, not TypeScript path aliases. pnpm workspace handles resolution natively.

---

## 0.3 Packages to Scaffold

Create these empty packages (src/index.ts with placeholder exports):

| Package | Description |
|---------|-------------|
| `packages/shared` | Shared types, enums, constants |
| `packages/memory` | Core memory layer (Drizzle, stores, retrieval) |
| `packages/mcp-server` | MCP server wrapping the memory layer |
| `packages/agent` | Agent loop + hook pipeline |
| `packages/gateway` | Persistent daemon process |
| `packages/tui` | Terminal user interface |

---

## 0.4 Shared Types (`packages/shared`)

### Files to Create

- `packages/shared/src/types.ts` — All shared type definitions
- `packages/shared/src/constants.ts` — Shared constants
- `packages/shared/src/errors.ts` — Custom error classes
- `packages/shared/src/index.ts` — Barrel export

### Key Type Definitions

```typescript
// --- PARA Types ---

type ParaType = 'project' | 'area' | 'resource' | 'archive';
type ContainerStatus = 'active' | 'paused' | 'completed' | 'archived';

// --- Brain Types ---

type BrainType = 'episodic' | 'semantic' | 'procedural' | 'prospective';

// --- Scope Types ---

type AccessScope = 'private' | 'team' | 'global';

// --- Entity Types ---

type EntityType =
  | 'person' | 'project' | 'tool' | 'service' | 'concept'
  | 'codebase' | 'organization' | 'device' | 'account'
  | 'language' | 'framework';

// --- Fact Types ---

type FactType =
  | 'preference' | 'decision' | 'convention' | 'status'
  | 'capability' | 'biographical' | 'environmental'
  | 'observation' | 'lesson_learned' | 'goal' | 'blocker';

type SourceType = 'stated' | 'extracted' | 'inferred' | 'promoted';

// --- Relation Types ---

type RelationType =
  | 'works_on' | 'uses' | 'owns' | 'created_by' | 'depends_on'
  | 'replaces' | 'related_to' | 'part_of' | 'collaborates_with'
  | 'deployed_on' | 'integrates_with';

// --- Working Memory ---

type TaskState = 'backlog' | 'active' | 'blocked' | 'done';

// --- Session ---

type Surface = 'tui' | 'web' | 'telegram' | 'discord';
type TurnRole = 'user' | 'assistant' | 'tool';

// --- Batch ---

type BatchTrigger = 'cron' | 'session_count' | 'manual';
type BatchStatus = 'running' | 'completed' | 'failed';

// --- Retrieval ---

type RetrievalMode = 'SessionStart' | 'PostCompact' | 'PerPrompt' | 'Heartbeat';

type EmbeddingSource = 'fact' | 'entity' | 'skill' | 'session_chunk';
```

### Base Interfaces

```typescript
// Mixin interfaces for common column patterns

interface Timestamped {
  createdAt: string;  // ISO 8601
  updatedAt: string;
}

interface Scoped {
  scope: AccessScope;
  projectId: string | null;
  ownerAgent: string | null;
}

interface WithProvenance {
  sourceSessionId: string | null;
  sourceType: SourceType;
  extractedBy: string | null;
}

interface WithConfidence {
  confidence: number;  // 0.0 - 1.0
}

interface WithDecay extends WithConfidence {
  decayRate: number;   // Per-day float, 0 = never decays
  lastConfirmedAt: string | null;
  lastAccessedAt: string | null;
}
```

### Domain Object Interfaces

Define interfaces for each domain object matching the ARCHITECTURE.md table specs. These are the *application-level* types returned by store functions — NOT Drizzle schema types (those live in `packages/memory/src/schema/`).

Key interfaces to define:
- `Container` — PARA container
- `Entity` — Knowledge graph node
- `Fact` — Knowledge graph claim
- `Relation` — Knowledge graph edge
- `WorkingMemoryTask` — Kanban task
- `SessionLogEntry` — Episodic memory turn
- `Skill` — Procedural memory index entry
- `EmbeddingRecord` — Embedding metadata
- `AgentIdentity` — Agent identity record
- `BatchRun` — Dream processing run metadata
- `CronJob` — Scheduled task

Each interface should compose the base mixins where applicable. For example:

```typescript
interface Fact extends Timestamped, Scoped, WithProvenance, WithDecay {
  id: string;
  entityId: string | null;
  containerId: string | null;
  type: FactType;
  content: string;
  structured: Record<string, unknown> | null;
  expiresAt: string | null;
  supersedesFactId: string | null;
}
```

---

## 0.5 Custom Error Classes

### File: `packages/shared/src/errors.ts`

```typescript
class MemoryError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MemoryError';
  }
}

class NotFoundError extends MemoryError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class InvalidStateTransitionError extends MemoryError {
  constructor(from: string, to: string) {
    super(`Invalid state transition: ${from} → ${to}`, 'INVALID_TRANSITION');
    this.name = 'InvalidStateTransitionError';
  }
}

class StoreError extends MemoryError {
  constructor(message: string, public readonly cause?: Error) {
    super(message, 'STORE_ERROR');
    this.name = 'StoreError';
  }
}

class EmbeddingError extends MemoryError {
  constructor(message: string) {
    super(message, 'EMBEDDING_ERROR');
    this.name = 'EmbeddingError';
  }
}
```

---

## 0.6 ID Generation Convention

Use `crypto.randomUUID()` (built into Node 22) for all IDs. UUIDs are v4 by default. No external UUID library needed.

```typescript
import { randomUUID } from 'node:crypto';

// Used in all store create functions
const id = randomUUID();
```

---

## 0.7 Vitest Configuration

### Files to Create

- `vitest.config.ts` (root)
- Per-package test files in `packages/{name}/tests/`

### Root Config

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['packages/*/tests/**/*.test.ts'],
  },
});
```

### Test Database Pattern

All memory tests use isolated in-memory SQLite:

```typescript
import { createDatabase } from '@neo-agent/memory';

function setupTestDb() {
  // Returns a Drizzle instance backed by in-memory SQLite
  return createDatabase(':memory:');
}

// In tests:
let db: ReturnType<typeof createDatabase>;

beforeEach(() => {
  db = setupTestDb();
  // Migrations run automatically in createDatabase
});
```

---

## 0.8 Store Function Convention

All store modules follow this pattern:

- **Exported functions**, not classes
- First parameter is always the Drizzle DB instance (`db: DrizzleDB`)
- Returns typed results using shared interfaces
- Throws `NotFoundError` for missing entities, `StoreError` for DB errors
- Handles JSON serialization/deserialization for JSON columns internally

### Pattern Example

```typescript
// packages/memory/src/store/entities.ts

import type { DrizzleDB } from '../db.js';
import type { Entity } from '@neo-agent/shared';
import { entities } from '../schema/entities.js';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { NotFoundError } from '@neo-agent/shared';

// --- Types for inputs (avoid exposing Drizzle insert types) ---

interface CreateEntityInput {
  type: EntityType;
  name: string;
  aliases?: string[];
  description?: string;
  containerId?: string;
  scope?: AccessScope;
  // ... other optional fields
}

// --- CRUD functions ---

async function createEntity(db: DrizzleDB, input: CreateEntityInput): Promise<Entity> {
  const id = randomUUID();
  const now = new Date().toISOString();
  // Insert with Drizzle, serialize aliases to JSON string
  // Return the created entity
}

async function getEntity(db: DrizzleDB, id: string): Promise<Entity> {
  // Query, deserialize JSON columns, throw NotFoundError if missing
}

async function listEntities(db: DrizzleDB, filters?: {
  type?: EntityType;
  containerId?: string;
  scope?: AccessScope;
}): Promise<Entity[]> {
  // Build query with optional where clauses
}

async function updateEntity(db: DrizzleDB, id: string, updates: Partial<CreateEntityInput>): Promise<Entity> {
  // Update, set updatedAt, return updated entity
}

export { createEntity, getEntity, listEntities, updateEntity };
```

---

## 0.9 JSON Column Convention

Columns storing arrays or objects (e.g., `aliases`, `decisions`, `tags`, `openQuestions`):

- Drizzle schema: use `text('column_name')` mode
- Store layer: `JSON.stringify()` on write, `JSON.parse()` on read
- Type safety: define the expected shape in the store's input/output types
- Default to empty array `'[]'` or `'null'` in schema, never leave undefined

---

## 0.10 Timestamp Convention

- All timestamps stored as ISO 8601 strings in SQLite text columns
- `createdAt` and `updatedAt` set automatically in store create/update functions using `new Date().toISOString()`
- Drizzle schema: `text('created_at').notNull().$defaultFn(() => new Date().toISOString())`

---

## 0.11 Dependencies

### Root package.json devDependencies

```
typescript ^5.7
vitest ^3
tsx ^4
drizzle-kit ^0.30
@types/better-sqlite3 ^7
```

### packages/shared — no dependencies (pure types)

### packages/memory

```
drizzle-orm ^0.40
better-sqlite3 ^11
```

Plus at build time: `sqlite-vec` (native addon, see 01a-SCHEMA.md for setup)

### packages/mcp-server

```
@modelcontextprotocol/sdk ^1
```

### packages/agent

```
@anthropic-ai/claude-agent-sdk ^0.2.81  (workspace root)
```

### packages/gateway

```
(determined in Phase 2)
```

---

## Dependency Graph

```
packages/shared     ← no deps (pure types)
     ↑
packages/memory     ← drizzle-orm, better-sqlite3, sqlite-vec
     ↑
packages/mcp-server ← @modelcontextprotocol/sdk, @neo-agent/memory
     ↑
packages/agent      ← @anthropic-ai/claude-agent-sdk, @neo-agent/mcp-server
     ↑
packages/gateway    ← @neo-agent/agent, @neo-agent/mcp-server
     ↑
packages/tui        ← @neo-agent/gateway
```

---

## Acceptance Criteria

- [ ] `pnpm install` succeeds from root
- [ ] All 6 packages exist with valid `package.json` and `tsconfig.json`
- [ ] `pnpm -r exec tsc --noEmit` passes (type-checking across all packages)
- [ ] `pnpm test` runs Vitest and finds test files
- [ ] Shared types importable from any package via `@neo-agent/shared`
- [ ] A trivial test in `packages/shared/tests/types.test.ts` passes (e.g., type assertions)

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `sqlite-vec` native addon may have build issues on Linux | Test early in 01a; fallback to pre-built binaries or WASM |
| pnpm workspace + TypeScript project references can be tricky with ESM | Use `tsx` for development (no build step needed), defer project references to later |
| Agent SDK `^0.2.81` is pre-1.0 and may have breaking changes | Pin exact version in package.json, monitor releases |
