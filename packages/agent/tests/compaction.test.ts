import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabase,
  type DrizzleDB,
  createMockEmbeddingProvider,
  type EmbeddingProvider,
  createTask,
} from '@neo-agent/memory';

import { countTokens, countMessageTokens } from '../src/compaction/token-counter.js';
import { shouldCompact, compact, DEFAULT_COMPACTION_CONFIG, type CompactionConfig } from '../src/compaction/compactor.js';

let db: DrizzleDB;
let provider: EmbeddingProvider;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('token counter', () => {
  it('estimates tokens as chars / 4', () => {
    expect(countTokens('hello')).toBe(2); // ceil(5/4) = 2
    expect(countTokens('a'.repeat(100))).toBe(25);
  });

  it('counts message tokens across all messages', () => {
    const messages = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'world' },
    ];
    expect(countMessageTokens(messages)).toBe(4); // 2 + 2
  });
});

describe('shouldCompact', () => {
  it('returns false when under threshold', () => {
    const messages = [{ role: 'user', content: 'short' }];
    expect(shouldCompact(messages)).toBe(false);
  });

  it('returns true when over threshold', () => {
    const config: CompactionConfig = {
      contextWindowTokens: 100,
      targetRatio: 0.5,
      headMessages: 2,
      tailMessages: 2,
    };
    // 50 tokens worth of content → over 50% of 100
    const messages = [{ role: 'user', content: 'x'.repeat(250) }]; // 63 tokens
    expect(shouldCompact(messages, config)).toBe(true);
  });
});

describe('compact', () => {
  const mockSummarize = async (text: string) => `Summary of ${text.length} chars of conversation.`;

  it('preserves head and tail messages', async () => {
    const config: CompactionConfig = {
      contextWindowTokens: 1000,
      targetRatio: 0.1,
      headMessages: 2,
      tailMessages: 2,
    };

    const messages = [
      { role: 'system', content: 'System prompt' },
      { role: 'user', content: 'First message' },
      { role: 'assistant', content: 'Middle 1' },
      { role: 'user', content: 'Middle 2' },
      { role: 'assistant', content: 'Middle 3' },
      { role: 'user', content: 'Recent 1' },
      { role: 'assistant', content: 'Recent 2' },
    ];

    const result = await compact(db, provider, 'agent-1', messages, mockSummarize, config);

    // Head (2) + summary (1) + tail (2) = 5
    expect(result.compactedMessages.length).toBeLessThanOrEqual(messages.length);
    expect(result.summary).toContain('Summary');

    // First message should be preserved
    expect(result.compactedMessages[0].content).toBe('System prompt');
    // Last message should be preserved
    expect(result.compactedMessages[result.compactedMessages.length - 1].content).toBe('Recent 2');
  });

  it('returns messages unchanged when too few to compact', async () => {
    const config: CompactionConfig = {
      contextWindowTokens: 1000,
      targetRatio: 0.1,
      headMessages: 2,
      tailMessages: 2,
    };

    const messages = [
      { role: 'user', content: 'Short' },
      { role: 'assistant', content: 'Reply' },
    ];

    const result = await compact(db, provider, 'agent-1', messages, mockSummarize, config);
    expect(result.compactedMessages).toHaveLength(2);
    expect(result.tokensRemoved).toBe(0);
  });

  it('includes working memory in re-injected context', async () => {
    createTask(db, { agentId: 'agent-1', title: 'Surviving task', state: 'active' });

    const config: CompactionConfig = {
      contextWindowTokens: 1000,
      targetRatio: 0.1,
      headMessages: 1,
      tailMessages: 1,
    };

    const messages = [
      { role: 'user', content: 'Start' },
      { role: 'assistant', content: 'Middle' },
      { role: 'user', content: 'More middle' },
      { role: 'assistant', content: 'End' },
    ];

    const result = await compact(db, provider, 'agent-1', messages, mockSummarize, config);

    // The summary message should contain re-injected memory context
    const summaryMsg = result.compactedMessages.find(m =>
      typeof m.content === 'string' && m.content.includes('Summary'),
    );
    expect(summaryMsg).toBeDefined();
    expect(summaryMsg!.content).toContain('Surviving task');
  });
});
