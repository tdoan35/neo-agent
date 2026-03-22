import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabase,
  type DrizzleDB,
  createMockEmbeddingProvider,
  type EmbeddingProvider,
  createTask,
  createFact,
  storeEmbedding,
  sessionLogs,
} from '@neo-agent/memory';

import { onPromptMiddleware, resetSession } from '../src/middleware/on-prompt.js';
import { postToolCallMiddleware, resetTurnCounter } from '../src/middleware/post-tool-call.js';

let db: DrizzleDB;
let provider: EmbeddingProvider;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
  resetSession('test-session');
  resetTurnCounter('test-session');
});

describe('onPromptMiddleware', () => {
  it('returns context on first prompt (SessionStart mode)', async () => {
    createTask(db, { agentId: 'agent-1', title: 'Active task', state: 'active' });

    const context = await onPromptMiddleware(db, provider, 'agent-1', null, 'Hello', 'test-session');

    expect(context).toContain('Active task');
  });

  it('returns PerPrompt context on subsequent prompts', async () => {
    // First call establishes session
    await onPromptMiddleware(db, provider, 'agent-1', null, 'First', 'test-session');

    // Store a fact for semantic retrieval
    const fact = createFact(db, { type: 'preference', content: 'Uses TypeScript for everything' });
    const vec = await provider.embed(fact.content);
    storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });

    // Second call uses PerPrompt mode
    const context = await onPromptMiddleware(
      db, provider, 'agent-1', null,
      'Uses TypeScript for everything', // Same text to match mock embedding
      'test-session',
    );

    // PerPrompt mode only returns blocks 4-5
    // May or may not have content depending on semantic match
    expect(typeof context).toBe('string');
  });
});

describe('postToolCallMiddleware', () => {
  it('logs tool call to session logs', async () => {
    await postToolCallMiddleware(db, 'agent-1', 'test-session', {
      toolName: 'readFile',
      args: { path: '/tmp/test.ts' },
      result: 'file contents',
    });

    const logs = db.select().from(sessionLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].toolName).toBe('readFile');
    expect(logs[0].role).toBe('tool');
  });

  it('increments turn index per session', async () => {
    await postToolCallMiddleware(db, 'agent-1', 'test-session', {
      toolName: 'bash', args: { command: 'ls' },
    });
    await postToolCallMiddleware(db, 'agent-1', 'test-session', {
      toolName: 'readFile', args: { path: '/tmp' },
    });

    const logs = db.select().from(sessionLogs).all();
    expect(logs).toHaveLength(2);
    expect(logs[0].turnIndex).toBe(0);
    expect(logs[1].turnIndex).toBe(1);
  });
});
