import { describe, it, expect, beforeEach } from 'vitest';
import { join } from 'node:path';
import {
  createDatabase,
  type DrizzleDB,
  createMockEmbeddingProvider,
  type EmbeddingProvider,
  listFacts,
  listEntities,
  listIdentities,
  createFact,
} from '@neo-agent/memory';
import { needsOnboarding, processOnboarding, AVAILABLE_PRESETS } from '../src/onboarding/wizard.js';

let db: DrizzleDB;
let provider: EmbeddingProvider;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('needsOnboarding', () => {
  it('returns true when no biographical facts exist', () => {
    expect(needsOnboarding(db)).toBe(true);
  });

  it('returns false when biographical facts exist', () => {
    createFact(db, { type: 'biographical', content: 'User is a developer', scope: 'global' });
    expect(needsOnboarding(db)).toBe(false);
  });
});

describe('processOnboarding', () => {
  it('creates user entity and stores facts', async () => {
    const result = await processOnboarding(db, provider, {
      name: 'Alice',
      role: 'Software Engineer',
      primaryUse: 'Coding',
      communicationStyle: 'concise',
      tools: ['VSCode', 'Git'],
    }, 'dana', join(process.cwd(), 'config', 'identities'));

    expect(result.userEntityId).toBeDefined();
    expect(result.identityId).toBeDefined();
    expect(result.factCount).toBe(5); // name, role, use, style, tools

    const facts = listFacts(db);
    expect(facts.length).toBeGreaterThanOrEqual(5);
    expect(facts.some(f => f.content.includes('Alice'))).toBe(true);
    expect(facts.some(f => f.content.includes('VSCode'))).toBe(true);

    const entities = listEntities(db);
    expect(entities.some(e => e.name === 'Alice')).toBe(true);

    const identities = listIdentities(db);
    expect(identities).toHaveLength(1);
    expect(identities[0].name).toBe('Dana');
    expect(identities[0].isPreset).toBe(true);
  });

  it('handles custom preset gracefully', async () => {
    const result = await processOnboarding(db, provider, {
      name: 'Bob',
      role: 'Designer',
      primaryUse: 'Design',
      communicationStyle: 'detailed',
      tools: [],
    }, 'custom');

    expect(result.factCount).toBe(4); // no tools fact
    const identities = listIdentities(db);
    expect(identities[0].name).toBe('Custom');
    expect(identities[0].isPreset).toBe(false);
  });
});

describe('AVAILABLE_PRESETS', () => {
  it('has 4 presets', () => {
    expect(AVAILABLE_PRESETS).toHaveLength(4);
    expect(AVAILABLE_PRESETS.map(p => p.name)).toEqual(['Dana', 'Carlos', 'Yuki', 'Aria']);
  });
});
