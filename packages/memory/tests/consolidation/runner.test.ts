import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabase,
  type DrizzleDB,
  createMockEmbeddingProvider,
  type EmbeddingProvider,
  appendLog,
  getBatchRun,
  getUnprocessedLogs,
  listFacts,
  runPipeline,
  type LlmCall,
} from '@neo-agent/memory';

let db: DrizzleDB;
let provider: EmbeddingProvider;

// Mock LLM that returns valid extraction results
const mockLlmCall: LlmCall = async (prompt: string) => {
  if (prompt.includes('classify')) {
    return JSON.stringify([
      {
        content: 'User prefers TypeScript',
        type: 'preference',
        containerName: 'General',
        entityName: 'TypeScript',
        entityType: 'language',
        confidence: 0.8,
      },
    ]);
  }
  if (prompt.includes('contradict')) {
    return 'COMPATIBLE';
  }
  if (prompt.includes('same entity')) {
    return 'NO — different entities';
  }
  if (prompt.includes('skill') || prompt.includes('procedure')) {
    return JSON.stringify({
      name: 'Test Skill',
      description: 'A test skill',
      steps: ['Step 1', 'Step 2'],
      tools: ['Read', 'Edit'],
      category: 'workflow',
      tags: ['test'],
    });
  }
  // Default: return classification
  return JSON.stringify([
    {
      content: 'Extracted observation',
      type: 'observation',
      containerName: 'General',
      confidence: 0.7,
    },
  ]);
};

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('runPipeline', () => {
  it('completes with zero stats when no unprocessed logs', async () => {
    const result = await runPipeline({
      db,
      embeddingProvider: provider,
      llmCall: mockLlmCall,
      triggerType: 'manual',
    });

    expect(result.sessionsProcessed).toBe(0);
    expect(result.factsCreated).toBe(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);

    // Batch run should be recorded as completed
    const batchRun = getBatchRun(db, result.batchRunId);
    expect(batchRun.status).toBe('completed');
  });

  it('processes unprocessed session logs', async () => {
    // Seed session logs
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 0, role: 'user', content: 'Review the auth module' });
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 1, role: 'assistant', content: 'I will look at the tokens...' });
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 2, role: 'tool', content: '{ "tool": "Read" }', toolName: 'Read' });

    const result = await runPipeline({
      db,
      embeddingProvider: provider,
      llmCall: mockLlmCall,
      triggerType: 'manual',
    });

    expect(result.sessionsProcessed).toBe(1);
    expect(result.batchRunId).toBeDefined();

    // Batch run should be completed
    const batchRun = getBatchRun(db, result.batchRunId);
    expect(batchRun.status).toBe('completed');
    expect(batchRun.sessionsProcessed).toBe(1);

    // Logs should be marked as processed
    const unprocessed = getUnprocessedLogs(db);
    expect(unprocessed).toHaveLength(0);
  });

  it('gracefully handles LLM failures in individual stages', async () => {
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 0, role: 'user', content: 'test' });

    const failingLlm: LlmCall = async () => {
      throw new Error('LLM is down');
    };

    // Pipeline should still complete — individual stage failures are caught
    const result = await runPipeline({
      db,
      embeddingProvider: provider,
      llmCall: failingLlm,
      triggerType: 'manual',
    });

    expect(result.sessionsProcessed).toBe(1);
    // No facts extracted because LLM failed
    expect(result.factsCreated).toBe(0);

    const batchRun = getBatchRun(db, result.batchRunId);
    expect(batchRun.status).toBe('completed');
  });

  it('processes multiple sessions', async () => {
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 0, role: 'user', content: 'Session 1' });
    appendLog(db, { sessionId: 's2', agentId: 'a1', turnIndex: 0, role: 'user', content: 'Session 2' });

    const result = await runPipeline({
      db,
      embeddingProvider: provider,
      llmCall: mockLlmCall,
      triggerType: 'cron',
    });

    expect(result.sessionsProcessed).toBe(2);
  });
});
