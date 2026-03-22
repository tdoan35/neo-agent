import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDatabase,
  type DrizzleDB,
  createMockEmbeddingProvider,
  type EmbeddingProvider,
  createTask,
} from '@neo-agent/memory';
import type { AgentIdentity } from '@neo-agent/shared';

import { getModelConfig, getAvailableModels, isTierAvailable, getTierOrder, type ModelTier } from '../src/secondary/providers.js';
import { routedGenerate, type GenerateFunction, type GenerateResult } from '../src/secondary/router.js';
import { getBuiltinTools } from '../src/secondary/tools/definitions.js';
import { runSecondaryAgent, type AgentEvent } from '../src/secondary/vercel-agent.js';

let db: DrizzleDB;
let provider: EmbeddingProvider;

const mockIdentity: AgentIdentity = {
  id: 'test-id',
  name: 'Test',
  role: 'Assistant',
  tone: 'helpful',
  avatar: { color: '#000', letter: 'T' },
  persona: 'You are a test assistant.',
  boundaries: [],
  soulPath: '',
  isPreset: false,
  createdFrom: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('providers', () => {
  it('returns config for all tiers', () => {
    const tiers: ModelTier[] = ['primary', 'fallback', 'local', 'emergency'];
    for (const tier of tiers) {
      const config = getModelConfig(tier);
      expect(config.tier).toBe(tier);
      expect(config.model).toBeDefined();
    }
  });

  it('lists all available models', () => {
    const models = getAvailableModels();
    expect(models.length).toBe(4);
  });

  it('local tier is always available (no API key needed)', () => {
    expect(isTierAvailable('local')).toBe(true);
  });

  it('getTierOrder moves preferred tier to front', () => {
    const order = getTierOrder('local');
    expect(order[0]).toBe('local');
  });

  it('getTierOrder default starts with primary', () => {
    const order = getTierOrder();
    expect(order[0]).toBe('primary');
  });
});

describe('router', () => {
  it('uses first successful generate', async () => {
    const generate: GenerateFunction = async (params) => ({
      text: 'Hello!',
      finishReason: 'stop',
      usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
      steps: [],
      modelTier: params.modelConfig.tier,
    });

    const result = await routedGenerate(
      { messages: [{ role: 'user', content: 'Hi' }] },
      generate,
    );

    expect(result.text).toBe('Hello!');
  });

  it('throws when all tiers fail', async () => {
    const generate: GenerateFunction = async () => {
      throw new Error('Model unavailable');
    };

    await expect(routedGenerate(
      { messages: [{ role: 'user', content: 'Hi' }] },
      generate,
      { maxRetries: 0 },
    )).rejects.toThrow('All model tiers failed');
  });
});

describe('tools', () => {
  it('provides builtin tool definitions', () => {
    const tools = getBuiltinTools();
    expect(tools.readFile).toBeDefined();
    expect(tools.writeFile).toBeDefined();
    expect(tools.bash).toBeDefined();
    expect(tools.grep).toBeDefined();
  });

  it('readFile tool has execute function', async () => {
    const tools = getBuiltinTools();
    const result = await tools.readFile.execute({ path: '/nonexistent/file' });
    expect(result).toContain('Error');
  });
});

describe('runSecondaryAgent', () => {
  it('yields response and done events', async () => {
    const mockGenerate: GenerateFunction = async () => ({
      text: 'I can help with that.',
      finishReason: 'stop',
      usage: { totalTokens: 20, promptTokens: 10, completionTokens: 10 },
      steps: [],
      modelTier: 'local' as ModelTier,
    });

    const events: AgentEvent[] = [];
    for await (const event of runSecondaryAgent({
      db,
      embeddingProvider: provider,
      identity: mockIdentity,
      agentId: 'test-agent',
      generate: mockGenerate,
    }, 'Hello')) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'response')).toBe(true);
    expect(events.some(e => e.type === 'done')).toBe(true);

    const responseEvent = events.find(e => e.type === 'response');
    expect((responseEvent as any).content).toBe('I can help with that.');
  });

  it('processes tool calls', async () => {
    let callCount = 0;
    const mockGenerate: GenerateFunction = async () => {
      callCount++;
      if (callCount === 1) {
        return {
          text: '',
          finishReason: 'tool_calls',
          usage: { totalTokens: 15, promptTokens: 10, completionTokens: 5 },
          steps: [{
            toolCalls: [{
              toolName: 'bash',
              args: { command: 'echo test' },
            }],
          }],
          modelTier: 'local' as ModelTier,
        };
      }
      return {
        text: 'Done!',
        finishReason: 'stop',
        usage: { totalTokens: 10, promptTokens: 5, completionTokens: 5 },
        steps: [],
        modelTier: 'local' as ModelTier,
      };
    };

    const events: AgentEvent[] = [];
    for await (const event of runSecondaryAgent({
      db,
      embeddingProvider: provider,
      identity: mockIdentity,
      agentId: 'test-agent',
      generate: mockGenerate,
    }, 'Run echo test')) {
      events.push(event);
    }

    expect(events.some(e => e.type === 'tool_call')).toBe(true);
    expect(events.some(e => e.type === 'tool_result')).toBe(true);
    expect(events.some(e => e.type === 'done')).toBe(true);
  });
});
