# Manual Test Plan: neo-agent Phases 1-5

Step-by-step verification of all implemented functionality. Each test can be run independently.

---

## Prerequisites

```bash
cd /mnt/data/Projects/neo-agent
node --version   # Must be ≥22
pnpm install
```

---

## 1. Automated Tests (223 tests)

```bash
# Run full test suite
pnpm test

# Verbose output with individual test names
pnpm test -- --reporter=verbose

# Run tests for a specific package
pnpm test -- packages/memory
pnpm test -- packages/agent
pnpm test -- packages/gateway
pnpm test -- packages/mcp-server
pnpm test -- packages/tui

# Run a specific test file
pnpm test -- packages/memory/tests/consolidation/runner.test.ts

# Watch mode (re-runs on file change)
pnpm test:watch
```

**Expected**: 223 tests, 27 files, all passing.

---

## 2. Type Safety

```bash
pnpm typecheck
```

**Expected**: Clean exit, no errors.

---

## 3. Memory CRUD (Phase 1a/1b)

Test core memory operations — entities, facts, embeddings, semantic search.

```bash
npx tsx -e "
const { createDatabase, createFact, createEntity, listFacts, listEntities, storeEmbedding, createMockEmbeddingProvider, searchSimilar } = require('@neo-agent/memory');

const db = createDatabase(':memory:');
const provider = createMockEmbeddingProvider();

const entity = createEntity(db, { type: 'tool', name: 'TypeScript', description: 'Programming language' });
console.log('Entity:', entity.name, entity.id.slice(0,8));

const f1 = createFact(db, { type: 'preference', content: 'Prefers strict mode', entityId: entity.id, scope: 'global' });
const f2 = createFact(db, { type: 'decision', content: 'Using ESM modules exclusively', scope: 'global' });
console.log('Facts created:', listFacts(db).length);

async function run() {
  const v1 = await provider.embed(f1.content);
  storeEmbedding(db, { sourceType: 'fact', sourceId: f1.id, textContent: f1.content, vector: v1 });
  const v2 = await provider.embed(f2.content);
  storeEmbedding(db, { sourceType: 'fact', sourceId: f2.id, textContent: f2.content, vector: v2 });

  const qv = await provider.embed('Prefers strict mode');
  const results = searchSimilar(db, qv, { limit: 5 });
  console.log('Search results:', results.length);
  results.forEach(r => console.log('  -', r.textContent, 'distance:', r.distance.toFixed(4)));
}
run();
"
```

**Expected**: Entity created, 2 facts created, semantic search returns results ranked by distance.

---

## 4. Working Memory / Kanban (Phase 1b)

```bash
npx tsx -e "
const { createDatabase, createTask, transitionTask, getBoard, formatForInjection, addDecision } = require('@neo-agent/memory');

const db = createDatabase(':memory:');

const t1 = createTask(db, { agentId: 'agent-1', title: 'Fix auth bug', state: 'backlog' });
const t2 = createTask(db, { agentId: 'agent-1', title: 'Write docs', state: 'backlog' });

transitionTask(db, t1.id, 'active');
addDecision(db, t1.id, 'Use JWT tokens');

const board = getBoard(db, 'agent-1');
console.log('Active:', board.active.map(t => t.title));
console.log('Backlog:', board.backlog.map(t => t.title));
console.log('Decisions on t1:', board.active[0]?.decisions);

console.log(formatForInjection(board));
"
```

**Expected**: Task transitions work, decisions stored, kanban renders as markdown.

---

## 5. Context Assembly / Retrieval (Phase 1c)

```bash
npx tsx -e "
const { createDatabase, createTask, createFact, storeEmbedding, createMockEmbeddingProvider, assembleContext } = require('@neo-agent/memory');

const db = createDatabase(':memory:');
const provider = createMockEmbeddingProvider();

createTask(db, { agentId: 'a1', title: 'Deploy v2', state: 'active' });
const fact = createFact(db, { type: 'preference', content: 'Dark mode everywhere', scope: 'global' });

async function run() {
  const vec = await provider.embed(fact.content);
  storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });

  const ctx = await assembleContext(db, provider, 'a1', null, '', { mode: 'SessionStart' });
  console.log('=== SessionStart Context ===');
  console.log(ctx);
  console.log('Contains working memory:', ctx.includes('Deploy v2'));
}
run();
"
```

**Expected**: Context includes working memory (task), user profile section, and relevant knowledge.

---

## 6. MCP Server Tools (Phase 1d)

```bash
npx tsx -e "
const { createDatabase, createMockEmbeddingProvider } = require('@neo-agent/memory');
const { createMemoryMcpServer } = require('@neo-agent/mcp-server');

const db = createDatabase(':memory:');
const provider = createMockEmbeddingProvider();

const server = createMemoryMcpServer({ db, embeddingProvider: provider, agentId: 'test' });
console.log('MCP server created:', typeof server.tool === 'function' ? 'OK' : 'FAIL');
console.log('Server type:', typeof server);
"
```

**Expected**: Server created successfully.

---

## 7. Gateway Health Server (Phase 2)

```bash
npx tsx -e "
const { createDatabase } = require('@neo-agent/memory');
const { startHealthServer } = require('@neo-agent/gateway');

const db = createDatabase(':memory:');

async function run() {
  const server = await startHealthServer(0, db, 'http://localhost:11434');
  console.log('Health server on port:', server.port);

  const resp = await fetch('http://localhost:' + server.port + '/health');
  const data = await resp.json();
  console.log('Health:', JSON.stringify(data, null, 2));

  const statusResp = await fetch('http://localhost:' + server.port + '/status');
  const statusData = await statusResp.json();
  console.log('Status:', JSON.stringify(statusData, null, 2));

  await server.close();
  console.log('Server closed.');
}
run();
"
```

**Expected**: Health endpoint returns `{ status: "ok", uptime, db: "connected", ollama: "disconnected" }`. Status returns memory stats.

---

## 8. PID File Enforcement (Phase 2)

```bash
npx tsx -e "
const { checkPidFile } = require('@neo-agent/gateway');
const fs = require('fs');
const path = require('path');
const os = require('os');

const fake = path.join(os.tmpdir(), 'test-' + Date.now() + '.pid');
console.log('No file:', checkPidFile(fake));

fs.writeFileSync(fake, String(process.pid));
console.log('Live PID:', checkPidFile(fake));
fs.unlinkSync(fake);

fs.writeFileSync(fake, '99999999');
console.log('Stale PID:', checkPidFile(fake));
console.log('File cleaned:', !fs.existsSync(fake));
"
```

**Expected**: `false`, `true`, `false`, `true`.

---

## 9. Agent Hooks — Compaction Survival (Phase 2)

This is the core anti-amnesia test: working memory survives the PreCompact → PostCompact cycle.

```bash
npx tsx -e "
const { createDatabase, createTask, createMockEmbeddingProvider } = require('@neo-agent/memory');
const { createSessionStartHook, createPreCompactHook, createPostCompactHook } = require('@neo-agent/agent');

const db = createDatabase(':memory:');
const provider = createMockEmbeddingProvider();

createTask(db, { agentId: 'a1', title: 'Important task', state: 'active' });

async function run() {
  const ssHook = createSessionStartHook(db, provider, 'a1');
  const ssResult = await ssHook({ hook_event_name: 'SessionStart', session_id: 's1', source: 'startup', cwd: '.', transcript_path: '' });
  console.log('SessionStart has context:', !!ssResult.hookSpecificOutput.additionalContext);
  console.log('Contains task:', ssResult.hookSpecificOutput.additionalContext?.includes('Important task'));

  const pcHook = createPreCompactHook(db, 'a1');
  const pcResult = await pcHook({ hook_event_name: 'PreCompact', session_id: 's1', trigger: 'auto', custom_instructions: null, cwd: '.', transcript_path: '' });
  console.log('PreCompact continue:', pcResult.continue);
  console.log('Tasks persisted:', pcResult.systemMessage);

  const postHook = createPostCompactHook(db, provider, 'a1');
  const postResult = await postHook({ hook_event_name: 'PostCompact', session_id: 's1', trigger: 'auto', compact_summary: 'prev conversation', cwd: '.', transcript_path: '' });
  console.log('PostCompact re-injected:', postResult.systemMessage?.includes('Important task'));
  console.log('Has compaction note:', postResult.systemMessage?.includes('compacted'));
}
run();
"
```

**Expected**: All hooks fire correctly. Working memory survives the full compaction cycle.

---

## 10. Slash Commands (Phase 3)

```bash
npx tsx -e "
const { createDatabase, createTask, appendLog } = require('@neo-agent/memory');
const { handleCommand } = require('@neo-agent/tui');
const { DEFAULT_GATEWAY_CONFIG } = require('@neo-agent/gateway');

const db = createDatabase(':memory:');
const ctx = { db, agentId: 'test', gatewayConfig: DEFAULT_GATEWAY_CONFIG };

async function run() {
  let r = await handleCommand('/help', ctx);
  console.log('Help:', r.output.slice(0, 80) + '...');

  r = await handleCommand('/tasks add Fix login bug', ctx);
  console.log('Add:', r.output);

  r = await handleCommand('/tasks', ctx);
  console.log('Board:', r.output.slice(0, 100));

  r = await handleCommand('/status', ctx);
  console.log('Status:', r.output);

  r = await handleCommand('/dream', ctx);
  console.log('Dream:', r.output);

  appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'test' });
  r = await handleCommand('/dream', ctx);
  console.log('Dream with data:', r.output);

  r = await handleCommand('/quit', ctx);
  console.log('Quit action:', r.action);
}
run();
"
```

**Expected**: All commands return appropriate output. `/tasks add` creates tasks, `/dream` reports session counts.

---

## 11. Onboarding Wizard (Phase 3)

```bash
npx tsx -e "
const { createDatabase, createMockEmbeddingProvider, listFacts, listIdentities } = require('@neo-agent/memory');
const { needsOnboarding, processOnboarding } = require('@neo-agent/tui');

const db = createDatabase(':memory:');
const provider = createMockEmbeddingProvider();

async function run() {
  console.log('Needs onboarding:', needsOnboarding(db));

  const result = await processOnboarding(db, provider, {
    name: 'Tyler',
    role: 'Software Engineer',
    primaryUse: 'Coding',
    communicationStyle: 'concise',
    tools: ['VSCode', 'Git', 'pnpm'],
  }, 'dana');

  console.log('Facts created:', result.factCount);
  console.log('Identity ID:', result.identityId.slice(0, 8));
  console.log('Needs onboarding now:', needsOnboarding(db));

  const facts = listFacts(db);
  console.log('All facts:', facts.map(f => f.content));

  const ids = listIdentities(db);
  console.log('Identity:', ids[0].name, '-', ids[0].role);
}
run();
"
```

**Expected**: Onboarding detects empty DB, creates user entity + 5 facts + identity. Second check returns `false`.

---

## 12. Cron Scheduler (Phase 3)

```bash
npx tsx -e "
const { createDatabase, listCronJobs } = require('@neo-agent/memory');
const { cronMatches, createCronScheduler, ensureBuiltinJobs } = require('@neo-agent/gateway');

const db = createDatabase(':memory:');

const now = new Date();
console.log('Every minute matches:', cronMatches('* * * * *', now));
console.log('Wrong hour matches:', cronMatches('0 99 * * *', now));

ensureBuiltinJobs(db);
const jobs = listCronJobs(db);
console.log('Builtin jobs:', jobs.map(j => j.name + ' (' + j.schedule + ')'));

const scheduler = createCronScheduler(db, { checkIntervalMs: 60000 });
scheduler.on('job', (job) => console.log('Job fired:', job.name));
scheduler.tick();
scheduler.stop();
console.log('Scheduler stopped.');
"
```

**Expected**: Cron matching works. 2 builtin jobs created (`nightly-dream`, `session-count-check`).

---

## 13. Dream Pipeline (Phase 4)

```bash
npx tsx -e "
const { createDatabase, createMockEmbeddingProvider, appendLog, runPipeline, getBatchRun, getUnprocessedLogs, listFacts } = require('@neo-agent/memory');

const db = createDatabase(':memory:');
const provider = createMockEmbeddingProvider();

const mockLlm = async (prompt) => {
  return JSON.stringify([
    { content: 'User prefers dark mode', type: 'preference', containerName: 'General', confidence: 0.9 },
    { content: 'TypeScript is the primary language', type: 'convention', containerName: 'General', entityName: 'TypeScript', entityType: 'language', confidence: 0.85 },
  ]);
};

async function run() {
  appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 0, role: 'user', content: 'Set up the project with TypeScript' });
  appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 1, role: 'assistant', content: 'I will configure TypeScript with strict mode...' });
  appendLog(db, { sessionId: 's2', agentId: 'a1', turnIndex: 0, role: 'user', content: 'Enable dark mode in all editors' });

  console.log('Unprocessed logs:', getUnprocessedLogs(db).length);

  const result = await runPipeline({
    db,
    embeddingProvider: provider,
    llmCall: mockLlm,
    triggerType: 'manual',
  });

  console.log('Sessions processed:', result.sessionsProcessed);
  console.log('Facts created:', result.factsCreated);
  console.log('Entities created:', result.entitiesCreated);
  console.log('Duration:', result.duration + 'ms');

  const batch = getBatchRun(db, result.batchRunId);
  console.log('Batch status:', batch.status);

  console.log('Unprocessed after:', getUnprocessedLogs(db).length);
  console.log('All facts:', listFacts(db).map(f => f.content));
}
run();
"
```

**Expected**: Pipeline processes 2 sessions, creates facts from mock LLM output, marks logs as processed, batch status = `completed`.

---

## 14. Model Router Fallback (Phase 5)

```bash
npx tsx -e "
const { routedGenerate, getTierOrder, isTierAvailable } = require('@neo-agent/agent');

console.log('Tier order:', getTierOrder());
console.log('Local available:', isTierAvailable('local'));

async function run() {
  let attempts = 0;
  const mockGenerate = async (params) => {
    attempts++;
    if (params.modelConfig.tier === 'primary') throw new Error('401 Unauthorized');
    if (params.modelConfig.tier === 'fallback') throw new Error('timeout');
    return {
      text: 'Hello from local model!',
      finishReason: 'stop',
      usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
      steps: [],
      modelTier: params.modelConfig.tier,
    };
  };

  const result = await routedGenerate(
    { messages: [{ role: 'user', content: 'Hi' }] },
    mockGenerate,
    { maxRetries: 0 },
  );

  console.log('Result from tier:', result.modelTier);
  console.log('Text:', result.text);
  console.log('Attempts before success:', attempts);
}
run();
"
```

**Expected**: Primary fails (auth), fallback fails (timeout), local succeeds. Shows automatic fallback.

---

## 15. Compaction — Working Memory Survival (Phase 5)

```bash
npx tsx -e "
const { createDatabase, createTask, createMockEmbeddingProvider } = require('@neo-agent/memory');
const { shouldCompact, compact, countMessageTokens } = require('@neo-agent/agent');

const db = createDatabase(':memory:');
const provider = createMockEmbeddingProvider();

createTask(db, { agentId: 'a1', title: 'Task survives compaction', state: 'active' });

async function run() {
  const messages = [
    { role: 'system', content: 'You are helpful.' },
    { role: 'user', content: 'First question' },
    ...Array.from({ length: 20 }, (_, i) => ({ role: i % 2 === 0 ? 'assistant' : 'user', content: 'Message ' + i + ' with some content to fill tokens.' })),
    { role: 'user', content: 'Recent question' },
    { role: 'assistant', content: 'Recent answer' },
  ];

  console.log('Total tokens:', countMessageTokens(messages));
  console.log('Should compact (low threshold):', shouldCompact(messages, { contextWindowTokens: 200, targetRatio: 0.5, headMessages: 2, tailMessages: 2 }));

  const result = await compact(db, provider, 'a1', messages,
    async (text) => 'Summarized ' + text.length + ' chars of conversation.',
    { contextWindowTokens: 200, targetRatio: 0.1, headMessages: 2, tailMessages: 3 },
  );

  console.log('Before:', messages.length, 'messages');
  console.log('After:', result.compactedMessages.length, 'messages');
  console.log('Tokens removed:', result.tokensRemoved);
  console.log('Working memory survived:', result.compactedMessages.some(m => typeof m.content === 'string' && m.content.includes('Task survives compaction')));
}
run();
"
```

**Expected**: Messages compacted from ~24 to ~6. Working memory re-injected into compacted output.

---

## Summary Checklist

| # | What | Phase | Pass Criteria |
|---|------|-------|---------------|
| 1 | Unit tests | All | 223 passing |
| 2 | Types | All | 0 errors |
| 3 | Memory CRUD | 1a/1b | Entity + facts + search works |
| 4 | Kanban | 1b | Transitions + decisions + render |
| 5 | Context assembly | 1c | All 5 blocks in SessionStart |
| 6 | MCP server | 1d | Server creates without error |
| 7 | Health server | 2 | HTTP 200 on /health and /status |
| 8 | PID file | 2 | Detect live/stale/missing correctly |
| 9 | Agent hooks | 2 | WM survives compaction cycle |
| 10 | Slash commands | 3 | All commands return output |
| 11 | Onboarding | 3 | Facts + identity created |
| 12 | Cron | 3 | Builtin jobs + matching works |
| 13 | Dream pipeline | 4 | Stages run, facts extracted |
| 14 | Router fallback | 5 | Falls through tiers correctly |
| 15 | Compaction | 5 | Head/tail preserved, WM survives |
