# Phase 1d: MCP Server

## Overview

An MCP server that wraps the memory layer, exposing 6 tools for memory recall, storage, search, working memory management, session handoff, and batch pipeline triggering. This server is how any agent — whether via the Agent SDK or Vercel AI SDK — interacts with memory.

**Estimated effort**: 2-3 days

---

## Prerequisites

- Phase 1b complete (store layer with all CRUD operations)
- Phase 1c complete (retrieval engine with `assembleContext`)
- Install in `packages/mcp-server`:
  - `@modelcontextprotocol/sdk` (MCP protocol implementation)

---

## Dependency Graph

```
packages/mcp-server/
  src/
    tools/
      memory-recall.ts      (calls retrieval engine)
      memory-store.ts       (calls fact + entity stores)
      memory-search.ts      (calls semantic + keyword search)
      memory-working-state.ts (calls working memory store + state machine)
      memory-handoff.ts     (calls session log + working memory stores)
      memory-dream.ts       (emits event / calls pipeline runner)
    server.ts               (MCP server setup + tool registration)
    transports/
      stdio.ts              (stdio transport entry point)
      http.ts               (HTTP transport entry point)
    index.ts                (barrel export)
```

Tools can be built in parallel. Server setup depends on all tools being defined.

---

## Architecture Decision: In-Process vs Separate Process

Two approaches for connecting the MCP server to the Agent SDK:

### Option A: In-Process SDK MCP Server (Recommended for Phase 2)

Use `createSdkMcpServer()` from the Agent SDK to run the MCP server in the same process as the agent. This avoids stdio overhead and allows direct function calls.

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

const memoryServer = createSdkMcpServer({
  name: 'neo-agent-memory',
  version: '0.1.0',
  tools: [recallTool, storeTool, searchTool, workingStateTool, handoffTool, dreamTool],
});

// Pass to query() options:
const q = query({
  prompt: '...',
  options: {
    mcpServers: { 'memory': memoryServer },
  }
});
```

Each tool is defined as an `SdkMcpToolDefinition`:

```typescript
import type { SdkMcpToolDefinition } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod/v4';

const tool: SdkMcpToolDefinition<typeof inputSchema> = {
  name: 'memory_recall',
  description: '...',
  inputSchema: { query: z.string(), ... },
  handler: async (args, extra) => { ... },
};
```

### Option B: Standalone Process (For HTTP transport, future use)

Standard MCP server using `@modelcontextprotocol/sdk` Server class with stdio or HTTP transport. Used for:
- Remote connections (Telegram gateway, web GUI)
- Third-party MCP clients

Both options share the same tool handler logic — only the registration mechanism differs.

### Recommendation

Build the tool handlers as pure functions that take `db` and `provider` dependencies. Then wrap them in either `SdkMcpToolDefinition` (for in-process) or `@modelcontextprotocol/sdk` tool definitions (for standalone).

---

## Implementation Units

### 1d.1 Tool: memory_recall

#### Purpose

Retrieve relevant context for the current situation. This is the primary "what do you know?" tool.

#### Input Schema

```typescript
{
  query: z.string().describe('What to recall — the current topic, question, or situation'),
  scope: z.enum(['global', 'team', 'private']).optional().describe('Filter by access scope'),
  limit: z.number().optional().default(10).describe('Max number of results'),
}
```

#### Handler Logic

1. Call `assembleContext(db, provider, agentId, projectId, args.query, { mode: 'PerPrompt' })`
2. Return the assembled context string as the tool result

#### Response Format

```json
{
  "content": [{
    "type": "text",
    "text": "## Working Memory\n...\n## Relevant Knowledge\n..."
  }]
}
```

---

### 1d.2 Tool: memory_store

#### Purpose

Explicitly save a fact, decision, or observation to the knowledge base.

#### Input Schema

```typescript
{
  content: z.string().describe('The fact, decision, or observation to store'),
  type: z.enum([
    'preference', 'decision', 'convention', 'status',
    'capability', 'biographical', 'environmental',
    'observation', 'lesson_learned', 'goal', 'blocker'
  ]).describe('Type of knowledge being stored'),
  entityName: z.string().optional().describe('Entity this fact relates to (will find-or-create)'),
  entityType: z.enum([
    'person', 'project', 'tool', 'service', 'concept',
    'codebase', 'organization', 'device', 'account',
    'language', 'framework'
  ]).optional().describe('Type of entity (required if entityName is new)'),
  scope: z.enum(['private', 'team', 'global']).optional().default('global'),
  confidence: z.number().min(0).max(1).optional().default(1.0),
}
```

#### Handler Logic

1. If `entityName` provided:
   a. Call `findEntityByAlias(db, entityName)` to check if entity exists
   b. If not found and `entityType` provided, create the entity
   c. If not found and no `entityType`, create with type `'concept'` as default
2. Create fact with `createFact(db, { content, type, entityId, scope, sourceType: 'stated', confidence })`
3. Generate embedding for the fact content and store via `storeEmbedding`
4. Return confirmation with fact ID

#### Response Format

```json
{
  "content": [{
    "type": "text",
    "text": "Stored fact (id: abc-123): \"Prefers pnpm over yarn\" linked to entity \"User\" (global scope, confidence: 1.0)"
  }]
}
```

---

### 1d.3 Tool: memory_search

#### Purpose

Search the knowledge base with semantic and/or keyword matching.

#### Input Schema

```typescript
{
  query: z.string().describe('Search query'),
  mode: z.enum(['semantic', 'keyword', 'both']).optional().default('both'),
  filters: z.object({
    entityType: z.enum([...]).optional(),
    factType: z.enum([...]).optional(),
    scope: z.enum(['global', 'team', 'private']).optional(),
    containerId: z.string().optional(),
    minConfidence: z.number().optional(),
  }).optional(),
  limit: z.number().optional().default(10),
}
```

#### Handler Logic

1. Based on `mode`:
   - `'semantic'`: Call `semanticSearch(db, provider, query, { limit, scope })`
   - `'keyword'`: Call `keywordSearch(db, query, { limit })`
   - `'both'`: Run both, merge and deduplicate results, re-rank by combined score
2. Apply additional filters (entity type, fact type, container, min confidence)
3. Format results with metadata (type, confidence, source, timestamps)

---

### 1d.4 Tool: memory_working_state

#### Purpose

Get or update the current task kanban board.

#### Input Schema

```typescript
{
  action: z.enum(['get', 'create', 'transition', 'update']).describe('Action to perform'),
  // For 'create':
  title: z.string().optional(),
  projectId: z.string().optional(),
  // For 'transition':
  taskId: z.string().optional(),
  toState: z.enum(['backlog', 'active', 'blocked', 'done']).optional(),
  blockers: z.string().optional(),
  // For 'update':
  decision: z.string().optional(),
  openQuestion: z.string().optional(),
  context: z.string().optional(),
  handoffSummary: z.string().optional(),
}
```

#### Handler Logic

- `get`: Call `getBoard(db, agentId, projectId)`, return formatted board
- `create`: Call `createTask(db, { agentId, title, projectId, state: 'backlog' })`
- `transition`: Call `transitionTask(db, taskId, toState, { blockers })`
- `update`: Call `addDecision`, `addOpenQuestion`, or `updateTask` based on which fields are provided

---

### 1d.5 Tool: memory_handoff

#### Purpose

Capture end-of-session summary for cross-surface continuity.

#### Input Schema

```typescript
{
  summary: z.string().describe('Human-readable summary of what was accomplished and what remains'),
}
```

#### Handler Logic

1. Get active tasks for this agent
2. For each active task, update `handoffSummary` with the provided summary
3. Flush any pending session log entries
4. Return confirmation

---

### 1d.6 Tool: memory_dream

#### Purpose

Trigger the batch processing pipeline (Pipeline 2).

#### Input Schema

```typescript
{}  // No parameters
```

#### Handler Logic

1. Check if a batch run is already in progress → return status if so
2. Emit a "dream trigger" event (or call the pipeline runner directly if available)
3. Return status: "Dream processing triggered. Will process N unprocessed sessions."

Note: The actual pipeline implementation is Phase 4. For now, this tool should count unprocessed sessions and return a placeholder message. Wire the actual pipeline in Phase 4.

---

### 1d.7 Server Setup

#### Files

- `packages/mcp-server/src/server.ts`

#### Key Interface

```typescript
interface MemoryServerConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  agentId: string;
  projectId?: string;
}

// For in-process use with Agent SDK
function createInProcessMemoryServer(config: MemoryServerConfig): McpSdkServerConfigWithInstance

// For standalone use
function createStandaloneMemoryServer(config: MemoryServerConfig): McpServer
```

#### Implementation Notes

**In-process server** uses `createSdkMcpServer()` from the Agent SDK:

```typescript
import { createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';

function createInProcessMemoryServer(config: MemoryServerConfig) {
  const tools = [
    createRecallTool(config),
    createStoreTool(config),
    createSearchTool(config),
    createWorkingStateTool(config),
    createHandoffTool(config),
    createDreamTool(config),
  ];

  return createSdkMcpServer({
    name: 'neo-agent-memory',
    version: '0.1.0',
    tools,
  });
}
```

Each `create*Tool` function returns an `SdkMcpToolDefinition` with the handler bound to the config's `db` and `embeddingProvider`.

**Standalone server** uses `@modelcontextprotocol/sdk` Server class:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

function createStandaloneMemoryServer(config: MemoryServerConfig) {
  const server = new McpServer({ name: 'neo-agent-memory', version: '0.1.0' });
  // Register tools with server.tool(name, schema, handler)
  return server;
}
```

---

### 1d.8 Transport Entry Points

#### Stdio Transport

```typescript
// packages/mcp-server/src/transports/stdio.ts
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function startStdioServer(config: MemoryServerConfig) {
  const server = createStandaloneMemoryServer(config);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
```

#### HTTP Transport

```typescript
// packages/mcp-server/src/transports/http.ts
// Deferred to Phase 6 (web GUI / Telegram)
// Placeholder: export function for future use
```

---

## Test Strategy

### Test Files

- `packages/mcp-server/tests/tools/recall.test.ts`
- `packages/mcp-server/tests/tools/store.test.ts`
- `packages/mcp-server/tests/tools/search.test.ts`
- `packages/mcp-server/tests/tools/working-state.test.ts`
- `packages/mcp-server/tests/tools/handoff.test.ts`
- `packages/mcp-server/tests/server.test.ts`

### Key Test Cases

**memory_recall**:
- Store facts, call recall with related query → relevant facts returned in markdown
- Empty DB → returns working memory block only (empty facts)

**memory_store**:
- Store a fact → verify it exists in DB with correct type and scope
- Store with entity name that exists → fact linked to existing entity
- Store with new entity name → entity created, fact linked
- Store with embedding → embedding stored in sqlite-vec

**memory_search**:
- Semantic mode: store facts with embeddings, search → relevant results
- Keyword mode: store session logs, search → FTS5 results
- Both mode: results from both sources merged

**memory_working_state**:
- `get` → returns formatted kanban board
- `create` → new task in backlog
- `transition` → valid transition works
- `transition` → invalid transition returns error message (not throw — MCP tools should return error content, not crash)

**memory_handoff**:
- Call handoff → active tasks' handoff summaries updated

**Server integration**:
- Create in-process server, verify all 6 tools registered
- Call each tool through the MCP protocol, verify responses are valid `CallToolResult` format

### Test Setup

```typescript
let db: DrizzleDB;
let provider: EmbeddingProvider;
let config: MemoryServerConfig;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
  config = { db, embeddingProvider: provider, agentId: 'test-agent' };
});
```

---

## Acceptance Criteria

- [ ] All 6 MCP tools defined with Zod input schemas
- [ ] In-process server creates via `createSdkMcpServer` and works with Agent SDK
- [ ] `memory_recall` returns assembled context blocks
- [ ] `memory_store` creates facts with entity linking and embeddings
- [ ] `memory_search` returns semantic and/or keyword results
- [ ] `memory_working_state` supports get/create/transition/update actions
- [ ] `memory_handoff` updates active task handoff summaries
- [ ] `memory_dream` returns status (placeholder until Phase 4)
- [ ] Error cases return error content in `CallToolResult`, don't crash the server
- [ ] All MCP server tests pass

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| `createSdkMcpServer` API may change (SDK is pre-1.0) | The function is already typed and documented. Pin SDK version. Tool handlers are pure functions — easy to rewrap |
| MCP tool error handling: uncaught exceptions crash the server | Wrap all handlers in try/catch. Return `{ content: [{ type: 'text', text: 'Error: ...' }], isError: true }` |
| `memory_store` with entity find-or-create has race condition potential | Single-user SQLite with WAL mode — no real concurrency issue. If needed, wrap in transaction |
| Agent may call `memory_store` excessively, polluting KB | This is a voluntary tool — the agent decides when to store. Quality control happens in Pipeline 2 (dedup, contradiction resolution) |
