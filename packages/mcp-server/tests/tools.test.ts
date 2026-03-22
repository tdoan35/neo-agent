import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB, createMockEmbeddingProvider, type EmbeddingProvider } from '@neo-agent/memory';
import { createFact, createEntity, createTask, appendLog, storeEmbedding, listFacts, getTask } from '@neo-agent/memory';
import { transitionTask } from '@neo-agent/memory';

import { createRecallHandler } from '../src/tools/memory-recall.js';
import { createStoreHandler } from '../src/tools/memory-store.js';
import { createSearchHandler } from '../src/tools/memory-search.js';
import { createWorkingStateHandler } from '../src/tools/memory-working-state.js';
import { createHandoffHandler } from '../src/tools/memory-handoff.js';
import { createDreamHandler } from '../src/tools/memory-dream.js';

let db: DrizzleDB;
let provider: EmbeddingProvider;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('memory_recall', () => {
  it('returns context for a query with relevant facts', async () => {
    // Store a fact with embedding so semantic search can find it
    const fact = createFact(db, { type: 'preference', content: 'Prefers dark mode in all editors' });
    const vec = await provider.embed(fact.content);
    storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });

    const handler = createRecallHandler(db, provider, 'agent-1');
    const result = await handler({ query: 'Prefers dark mode in all editors' });

    expect(result.content[0].text).toContain('dark mode');
  });

  it('returns message when no context found', async () => {
    const handler = createRecallHandler(db, provider, 'agent-1');
    const result = await handler({ query: 'random query' });

    expect(result.content[0].type).toBe('text');
  });
});

describe('memory_store', () => {
  it('stores a fact and returns confirmation', async () => {
    const handler = createStoreHandler(db, provider, 'agent-1');
    const result = await handler({
      content: 'Prefers dark mode',
      type: 'preference',
    });

    expect(result.content[0].text).toContain('Stored fact');
    expect(result.content[0].text).toContain('Prefers dark mode');

    const facts = listFacts(db);
    expect(facts).toHaveLength(1);
    expect(facts[0].content).toBe('Prefers dark mode');
  });

  it('finds or creates entity when entityName provided', async () => {
    // Create existing entity
    createEntity(db, { type: 'tool', name: 'pnpm' });

    const handler = createStoreHandler(db, provider, 'agent-1');

    // Store fact linked to existing entity
    const result = await handler({
      content: 'pnpm is the preferred package manager',
      type: 'preference',
      entityName: 'pnpm',
    });

    expect(result.content[0].text).toContain('linked to entity "pnpm"');
  });

  it('creates new entity when entityName not found', async () => {
    const handler = createStoreHandler(db, provider, 'agent-1');
    const result = await handler({
      content: 'Uses Vitest for testing',
      type: 'preference',
      entityName: 'Vitest',
      entityType: 'tool',
    });

    expect(result.content[0].text).toContain('linked to entity "Vitest"');
  });
});

describe('memory_search', () => {
  it('searches semantically with embeddings', async () => {
    const fact = createFact(db, { type: 'preference', content: 'TypeScript for backend development' });
    const vec = await provider.embed(fact.content);
    storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });

    const handler = createSearchHandler(db, provider, 'agent-1');
    // Use exact same text to guarantee a match with mock embeddings
    const result = await handler({ query: 'TypeScript for backend development', mode: 'semantic' });

    expect(result.content[0].text).toContain('Semantic Results');
  });

  it('searches by keyword in session logs', async () => {
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'review the authentication module' });

    const handler = createSearchHandler(db, provider, 'agent-1');
    const result = await handler({ query: 'authentication', mode: 'keyword' });

    expect(result.content[0].text).toContain('Keyword Results');
    expect(result.content[0].text).toContain('authentication');
  });

  it('returns no results message when empty', async () => {
    const handler = createSearchHandler(db, provider, 'agent-1');
    const result = await handler({ query: 'nonexistent' });

    expect(result.content[0].text).toBe('No results found.');
  });
});

describe('memory_working_state', () => {
  it('get action returns kanban board', async () => {
    createTask(db, { agentId: 'agent-1', title: 'Task 1', state: 'active' });

    const handler = createWorkingStateHandler(db, 'agent-1');
    const result = await handler({ action: 'get' });

    expect(result.content[0].text).toContain('Task 1');
  });

  it('create action adds a task', async () => {
    const handler = createWorkingStateHandler(db, 'agent-1');
    const result = await handler({ action: 'create', title: 'New task' });

    expect(result.content[0].text).toContain('Created task "New task"');
    expect(result.content[0].text).toContain('backlog');
  });

  it('transition action changes task state', async () => {
    const task = createTask(db, { agentId: 'agent-1', title: 'Task' });

    const handler = createWorkingStateHandler(db, 'agent-1');
    const result = await handler({ action: 'transition', taskId: task.id, toState: 'active' });

    expect(result.content[0].text).toContain('transitioned to active');
  });

  it('transition to blocked requires blockers', async () => {
    const task = createTask(db, { agentId: 'agent-1', title: 'Task', state: 'active' });

    const handler = createWorkingStateHandler(db, 'agent-1');
    const result = await handler({ action: 'transition', taskId: task.id, toState: 'blocked' });

    expect(result.isError).toBe(true);
  });

  it('update action records a decision', async () => {
    const task = createTask(db, { agentId: 'agent-1', title: 'Task' });

    const handler = createWorkingStateHandler(db, 'agent-1');
    const result = await handler({ action: 'update', taskId: task.id, decision: 'Use JWT' });

    expect(result.content[0].text).toContain('decision: "Use JWT"');
    const updated = getTask(db, task.id);
    expect(updated.decisions).toHaveLength(1);
  });
});

describe('memory_handoff', () => {
  it('saves handoff summary to active tasks', async () => {
    const task = createTask(db, { agentId: 'agent-1', title: 'Active task', state: 'active' });

    const handler = createHandoffHandler(db, 'agent-1');
    const result = await handler({ summary: 'Completed the auth refactor, need to write tests next.' });

    expect(result.content[0].text).toContain('1 active/blocked task(s)');
    const updated = getTask(db, task.id);
    expect(updated.handoffSummary).toContain('auth refactor');
  });
});

describe('memory_dream', () => {
  it('reports no unprocessed sessions when empty', async () => {
    const handler = createDreamHandler(db);
    const result = await handler({} as Record<string, never>);

    expect(result.content[0].text).toContain('No unprocessed sessions');
  });

  it('reports count of unprocessed sessions', async () => {
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'msg1' });
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 1, role: 'assistant', content: 'msg2' });
    appendLog(db, { sessionId: 's2', agentId: 'a', turnIndex: 0, role: 'user', content: 'msg3' });

    const handler = createDreamHandler(db);
    const result = await handler({} as Record<string, never>);

    expect(result.content[0].text).toContain('2 session(s)');
    expect(result.content[0].text).toContain('3 unprocessed log entries');
  });
});
