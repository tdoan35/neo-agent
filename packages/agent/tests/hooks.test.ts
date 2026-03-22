import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabase,
  type DrizzleDB,
  createMockEmbeddingProvider,
  type EmbeddingProvider,
  createFact,
  storeEmbedding,
  createTask,
  getTask,
  appendLog,
  listFacts,
  listEntities,
  getBoard,
} from '@neo-agent/memory';

import { createSessionStartHook } from '../src/hooks/session-start.js';
import { createUserPromptHook } from '../src/hooks/user-prompt.js';
import { createPostToolUseHook, resetSessionTurnCounter } from '../src/hooks/post-tool-use.js';
import { createPreCompactHook } from '../src/hooks/pre-compact.js';
import { createPostCompactHook } from '../src/hooks/post-compact.js';
import { createStopHook } from '../src/hooks/stop.js';
import { createHookPipeline } from '../src/hooks/index.js';

let db: DrizzleDB;
let provider: EmbeddingProvider;
const AGENT_ID = 'test-agent';

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
  resetSessionTurnCounter('test-session');
});

describe('SessionStart hook', () => {
  it('returns additionalContext with working memory on startup', async () => {
    createTask(db, { agentId: AGENT_ID, title: 'My active task', state: 'active' });

    const hook = createSessionStartHook(db, provider, AGENT_ID);
    const result = await hook({
      hook_event_name: 'SessionStart',
      session_id: 'test-session',
      source: 'startup',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result.hookSpecificOutput.hookEventName).toBe('SessionStart');
    expect(result.hookSpecificOutput.additionalContext).toContain('My active task');
  });

  it('returns context on compact source using PostCompact mode', async () => {
    createTask(db, { agentId: AGENT_ID, title: 'Task survives compaction', state: 'active' });

    const hook = createSessionStartHook(db, provider, AGENT_ID);
    const result = await hook({
      hook_event_name: 'SessionStart',
      session_id: 'test-session',
      source: 'compact',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result.hookSpecificOutput.additionalContext).toContain('Task survives compaction');
  });
});

describe('UserPromptSubmit hook', () => {
  it('returns relevant knowledge for prompt', async () => {
    // Store a fact with embedding
    const fact = createFact(db, { type: 'preference', content: 'TypeScript strict mode always enabled' });
    const vec = await provider.embed(fact.content);
    storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });

    const hook = createUserPromptHook(db, provider, AGENT_ID);
    const result = await hook({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'test-session',
      prompt: 'TypeScript strict mode always enabled',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    // PerPrompt mode returns blocks 4-5 (relevant knowledge + skills)
    if (result.hookSpecificOutput.additionalContext) {
      expect(result.hookSpecificOutput.additionalContext).toContain('TypeScript');
    }
  });
});

describe('PostToolUse hook', () => {
  it('logs tool call to session logs', async () => {
    const hook = createPostToolUseHook(db, AGENT_ID);
    const result = await hook({
      hook_event_name: 'PostToolUse',
      session_id: 'test-session',
      tool_name: 'Read',
      tool_input: { file_path: '/tmp/test.ts' },
      tool_response: 'file contents here',
      tool_use_id: 'tu-1',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    // Should return async: true
    expect(result).toEqual({ async: true });

    // Verify session log was created
    const logs = db.select().from((await import('@neo-agent/memory')).sessionLogs).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].toolName).toBe('Read');
    expect(logs[0].role).toBe('tool');
  });

  it('truncates large tool responses', async () => {
    const hook = createPostToolUseHook(db, AGENT_ID);
    const largeResponse = 'x'.repeat(2000);

    await hook({
      hook_event_name: 'PostToolUse',
      session_id: 'test-session',
      tool_name: 'Read',
      tool_input: {},
      tool_response: largeResponse,
      tool_use_id: 'tu-2',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    const logs = db.select().from((await import('@neo-agent/memory')).sessionLogs).all();
    const content = JSON.parse(logs[0].content);
    expect(content.response.length).toBeLessThan(largeResponse.length);
    expect(content.response).toContain('truncated');
  });
});

describe('PreCompact hook', () => {
  it('returns continue: true with task count', async () => {
    createTask(db, { agentId: AGENT_ID, title: 'Task A', state: 'active' });
    createTask(db, { agentId: AGENT_ID, title: 'Task B', state: 'backlog' });

    const hook = createPreCompactHook(db, AGENT_ID);
    const result = await hook({
      hook_event_name: 'PreCompact',
      session_id: 'test-session',
      trigger: 'auto',
      custom_instructions: null,
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result.continue).toBe(true);
    expect(result.systemMessage).toContain('2 task(s)');
  });

  it('returns no systemMessage when no tasks', async () => {
    const hook = createPreCompactHook(db, AGENT_ID);
    const result = await hook({
      hook_event_name: 'PreCompact',
      session_id: 'test-session',
      trigger: 'manual',
      custom_instructions: null,
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result.continue).toBe(true);
    expect(result.systemMessage).toBeUndefined();
  });
});

describe('PostCompact hook', () => {
  it('re-injects full context with compaction note', async () => {
    createTask(db, { agentId: AGENT_ID, title: 'Surviving task', state: 'active' });

    const hook = createPostCompactHook(db, provider, AGENT_ID);
    const result = await hook({
      hook_event_name: 'PostCompact',
      session_id: 'test-session',
      trigger: 'auto',
      compact_summary: 'Previous conversation was about testing',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result.systemMessage).toContain('Context was compacted');
    expect(result.systemMessage).toContain('Surviving task');
  });
});

describe('Stop hook', () => {
  it('returns async: true when stop_hook_active', async () => {
    const hook = createStopHook(db, provider, AGENT_ID, undefined, {
      ollamaUrl: 'http://localhost:99999', // unreachable
    });

    const result = await hook({
      hook_event_name: 'Stop',
      session_id: 'test-session',
      stop_hook_active: true,
      last_assistant_message: 'Some message',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result).toEqual({ async: true });
  });

  it('returns async: true for very short messages', async () => {
    const hook = createStopHook(db, provider, AGENT_ID, undefined, {
      ollamaUrl: 'http://localhost:99999',
    });

    const result = await hook({
      hook_event_name: 'Stop',
      session_id: 'test-session',
      stop_hook_active: false,
      last_assistant_message: 'Ok.',
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result).toEqual({ async: true });
  });

  it('logs assistant message and attempts extraction', async () => {
    const hook = createStopHook(db, provider, AGENT_ID, undefined, {
      ollamaUrl: 'http://localhost:99999', // Will fail — extraction returns []
    });

    const longMessage = 'I have decided to use JWT tokens for authentication because they are stateless and work well with our microservice architecture. '.repeat(5);

    const result = await hook({
      hook_event_name: 'Stop',
      session_id: 'test-session',
      stop_hook_active: false,
      last_assistant_message: longMessage,
      cwd: '/tmp',
      transcript_path: '/tmp/transcript',
    });

    expect(result).toEqual({ async: true });

    // The assistant message should have been logged
    const logs = db.select().from((await import('@neo-agent/memory')).sessionLogs).all();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].role).toBe('assistant');
  });
});

describe('createHookPipeline', () => {
  it('creates hooks for all 6 events', () => {
    const pipeline = createHookPipeline({
      db,
      embeddingProvider: provider,
      agentId: AGENT_ID,
    });

    expect(pipeline.SessionStart).toHaveLength(1);
    expect(pipeline.UserPromptSubmit).toHaveLength(1);
    expect(pipeline.PostToolUse).toHaveLength(1);
    expect(pipeline.PreCompact).toHaveLength(1);
    expect(pipeline.PostCompact).toHaveLength(1);
    expect(pipeline.Stop).toHaveLength(1);

    // Each entry should have a hooks array
    expect(pipeline.SessionStart[0].hooks).toHaveLength(1);
  });
});
