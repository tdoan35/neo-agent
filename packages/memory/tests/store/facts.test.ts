import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import {
  createFact, getFact, updateFact, supersedeFact, listFacts,
  touchFact, confirmFact, calculateDecay, applyDecay, bulkApplyDecay,
} from '@neo-agent/memory';
import { NotFoundError } from '@neo-agent/shared';
import type { Fact } from '@neo-agent/shared';

let db: DrizzleDB;
beforeEach(() => { db = createDatabase(':memory:'); });

describe('facts store', () => {
  it('creates a fact with defaults', () => {
    const f = createFact(db, { type: 'preference', content: 'Prefers dark mode' });
    expect(f.content).toBe('Prefers dark mode');
    expect(f.confidence).toBe(1.0);
    expect(f.decayRate).toBe(0.02);
    expect(f.sourceType).toBe('stated');
    expect(f.scope).toBe('global');
  });

  it('creates a fact with structured data', () => {
    const f = createFact(db, {
      type: 'preference',
      content: 'Prefers pnpm',
      structured: { key: 'pkg_mgr', value: 'pnpm' },
    });
    expect(f.structured).toEqual({ key: 'pkg_mgr', value: 'pnpm' });
  });

  it('supersedes a fact', () => {
    const old = createFact(db, { type: 'preference', content: 'Uses npm' });
    const newer = supersedeFact(db, old.id, { type: 'preference', content: 'Uses pnpm' });
    expect(newer.supersedesFactId).toBe(old.id);
    // Old fact still exists
    const oldFetched = getFact(db, old.id);
    expect(oldFetched.content).toBe('Uses npm');
  });

  it('lists facts with filters', () => {
    createFact(db, { type: 'preference', content: 'A', scope: 'global' });
    createFact(db, { type: 'decision', content: 'B', scope: 'global' });
    createFact(db, { type: 'preference', content: 'C', scope: 'private' });

    expect(listFacts(db, { type: 'preference' })).toHaveLength(2);
    expect(listFacts(db, { scope: 'global' })).toHaveLength(2);
    expect(listFacts(db, { type: 'preference', scope: 'global' })).toHaveLength(1);
  });

  it('lists facts with minConfidence filter', () => {
    createFact(db, { type: 'observation', content: 'High', confidence: 0.9 });
    createFact(db, { type: 'observation', content: 'Low', confidence: 0.2 });

    expect(listFacts(db, { minConfidence: 0.5 })).toHaveLength(1);
    expect(listFacts(db, { minConfidence: 0.1 })).toHaveLength(2);
  });

  it('touchFact boosts confidence and sets lastAccessedAt', () => {
    const f = createFact(db, { type: 'preference', content: 'test', confidence: 0.5 });
    touchFact(db, f.id);
    const touched = getFact(db, f.id);
    expect(touched.confidence).toBe(0.55);
    expect(touched.lastAccessedAt).toBeDefined();
  });

  it('touchFact caps confidence at 1.0', () => {
    const f = createFact(db, { type: 'preference', content: 'test', confidence: 0.98 });
    touchFact(db, f.id);
    const touched = getFact(db, f.id);
    expect(touched.confidence).toBe(1.0);
  });

  it('confirmFact resets confidence to 1.0', () => {
    const f = createFact(db, { type: 'preference', content: 'test', confidence: 0.3 });
    confirmFact(db, f.id);
    const confirmed = getFact(db, f.id);
    expect(confirmed.confidence).toBe(1.0);
    expect(confirmed.lastConfirmedAt).toBeDefined();
  });
});

describe('decay', () => {
  it('calculateDecay reduces confidence over time', () => {
    const fact: Fact = {
      id: 'test', entityId: null, containerId: null, type: 'observation',
      content: 'test', structured: null, scope: 'global', projectId: null,
      ownerAgent: null, sourceSessionId: null, sourceType: 'stated',
      extractedBy: null, confidence: 1.0, decayRate: 0.1,
      lastConfirmedAt: null, lastAccessedAt: null,
      expiresAt: null, supersedesFactId: null,
      createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
    };

    // After 10 days with 0.1 decay rate
    const now = new Date('2026-03-11T00:00:00.000Z');
    const decayed = calculateDecay(fact, now);
    // 1.0 * (1 - 0.1)^10 = 1.0 * 0.9^10 ≈ 0.3487
    expect(decayed).toBeCloseTo(0.3487, 3);
  });

  it('calculateDecay uses most recent activity', () => {
    const fact: Fact = {
      id: 'test', entityId: null, containerId: null, type: 'observation',
      content: 'test', structured: null, scope: 'global', projectId: null,
      ownerAgent: null, sourceSessionId: null, sourceType: 'stated',
      extractedBy: null, confidence: 1.0, decayRate: 0.1,
      lastConfirmedAt: null, lastAccessedAt: '2026-03-09T00:00:00.000Z',
      expiresAt: null, supersedesFactId: null,
      createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z',
    };

    // Only 2 days since last access, not 10 since creation
    const now = new Date('2026-03-11T00:00:00.000Z');
    const decayed = calculateDecay(fact, now);
    // 1.0 * 0.9^2 = 0.81
    expect(decayed).toBeCloseTo(0.81, 2);
  });

  it('bulkApplyDecay archives and prunes facts', () => {
    // Create facts with different confidence levels
    createFact(db, { type: 'observation', content: 'Fresh', confidence: 1.0, decayRate: 0 });
    createFact(db, { type: 'observation', content: 'Low', confidence: 0.08, decayRate: 0.5 });
    createFact(db, { type: 'observation', content: 'Very low', confidence: 0.005, decayRate: 0.5 });

    const now = new Date();
    now.setDate(now.getDate() + 1); // 1 day later
    const result = bulkApplyDecay(db, now);

    expect(result.pruned).toBeGreaterThanOrEqual(1); // 0.005 fact should be pruned
    // The 0.08 fact with 0.5 decay over 1 day: 0.08 * 0.5 = 0.04 < 0.1 → archived
    expect(result.archived).toBeGreaterThanOrEqual(1);
  });
});
