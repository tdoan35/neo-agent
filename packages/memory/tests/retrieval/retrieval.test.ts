import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import {
  createMockEmbeddingProvider,
  storeEmbedding,
  createFact,
  createEntity,
  createTask,
  appendLog,
  semanticSearch,
  keywordSearch,
  assembleContext,
  assembleBlocks,
} from '@neo-agent/memory';
import { filterByScope } from '@neo-agent/memory';
import type { EmbeddingProvider } from '@neo-agent/memory';

let db: DrizzleDB;
let provider: EmbeddingProvider;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('scope filtering', () => {
  it('global items are always visible', () => {
    const items = [{ scope: 'global' as const, projectId: null, ownerAgent: null }];
    expect(filterByScope(items, { agentId: 'any' })).toHaveLength(1);
  });

  it('team items visible only when project matches', () => {
    const items = [
      { scope: 'team' as const, projectId: 'proj-1', ownerAgent: null },
      { scope: 'team' as const, projectId: 'proj-2', ownerAgent: null },
    ];
    expect(filterByScope(items, { agentId: 'a', projectId: 'proj-1' })).toHaveLength(1);
    expect(filterByScope(items, { agentId: 'a' })).toHaveLength(0); // no project → no team items
  });

  it('private items visible only when agent matches', () => {
    const items = [
      { scope: 'private' as const, projectId: null, ownerAgent: 'agent-1' },
      { scope: 'private' as const, projectId: null, ownerAgent: 'agent-2' },
    ];
    expect(filterByScope(items, { agentId: 'agent-1' })).toHaveLength(1);
    expect(filterByScope(items, { agentId: 'agent-3' })).toHaveLength(0);
  });
});

describe('semantic search', () => {
  it('returns relevant facts ranked by composite score', async () => {
    // Create facts with embeddings
    const facts = [
      createFact(db, { type: 'preference', content: 'Prefers TypeScript for backend development', confidence: 0.9 }),
      createFact(db, { type: 'preference', content: 'Uses pnpm as package manager', confidence: 1.0 }),
      createFact(db, { type: 'observation', content: 'The weather is sunny today', confidence: 0.5 }),
    ];

    for (const fact of facts) {
      const vec = await provider.embed(fact.content);
      storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });
    }

    const results = await semanticSearch(db, provider, 'TypeScript programming', { finalLimit: 3 });
    expect(results.length).toBeGreaterThan(0);
    // All results should have scores
    for (const r of results) {
      expect(r.score).toBeGreaterThan(0);
      expect(r.similarity).toBeGreaterThan(0);
    }
  });

  it('respects scope filtering', async () => {
    const privateFact = createFact(db, {
      type: 'observation', content: 'Private note', scope: 'private', ownerAgent: 'agent-1',
    });
    const globalFact = createFact(db, {
      type: 'preference', content: 'Global preference',
    });

    for (const fact of [privateFact, globalFact]) {
      const vec = await provider.embed(fact.content);
      storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });
    }

    // Search as agent-2 — should not see agent-1's private fact
    const results = await semanticSearch(db, provider, 'note preference', {
      scope: { agentId: 'agent-2' },
    });

    const sourceIds = results.map(r => r.sourceId);
    expect(sourceIds).not.toContain(privateFact.id);
  });
});

describe('keyword search', () => {
  it('finds matching session logs', () => {
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'review the authentication module' });
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 1, role: 'assistant', content: 'looking at the database schema' });

    const results = keywordSearch(db, 'authentication');
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('authentication');
  });

  it('respects limit', () => {
    for (let i = 0; i < 5; i++) {
      appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: i, role: 'user', content: `testing message ${i}` });
    }
    expect(keywordSearch(db, 'testing', { limit: 2 })).toHaveLength(2);
  });

  it('filters by sessionId', () => {
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'testing in session 1' });
    appendLog(db, { sessionId: 's2', agentId: 'a', turnIndex: 0, role: 'user', content: 'testing in session 2' });

    expect(keywordSearch(db, 'testing', { sessionId: 's1' })).toHaveLength(1);
  });
});

describe('context assembler', () => {
  it('SessionStart mode assembles all blocks', async () => {
    // Set up some data
    createTask(db, { agentId: 'agent-1', title: 'Active task', state: 'active' });
    createFact(db, { type: 'biographical', content: 'User is a software engineer', scope: 'global' });

    const blocks = await assembleBlocks(db, provider, 'agent-1', null, 'hello', { mode: 'SessionStart' });

    expect(blocks.workingMemory).toContain('Active task');
    expect(blocks.userProfile).toContain('software engineer');
    expect(blocks.totalTokenEstimate).toBeGreaterThan(0);
  });

  it('Heartbeat mode only returns working memory', async () => {
    createTask(db, { agentId: 'agent-1', title: 'My task', state: 'active' });
    createFact(db, { type: 'biographical', content: 'User info', scope: 'global' });

    const blocks = await assembleBlocks(db, provider, 'agent-1', null, '', { mode: 'Heartbeat' });

    expect(blocks.workingMemory).toContain('My task');
    expect(blocks.userProfile).toBe('');
    expect(blocks.projectContext).toBe('');
    expect(blocks.relevantKnowledge).toBe('');
  });

  it('assembleContext returns concatenated string', async () => {
    createTask(db, { agentId: 'a', title: 'Task 1', state: 'active' });

    const context = await assembleContext(db, provider, 'a', null, 'test query', { mode: 'SessionStart' });

    expect(typeof context).toBe('string');
    expect(context).toContain('Working Memory');
  });

  it('PerPrompt mode skips working memory and profile', async () => {
    createTask(db, { agentId: 'a', title: 'Task 1', state: 'active' });

    const blocks = await assembleBlocks(db, provider, 'a', null, 'query', { mode: 'PerPrompt' });

    expect(blocks.workingMemory).toBe('');
    expect(blocks.userProfile).toBe('');
  });
});
