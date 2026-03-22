import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB, createFact, listFacts, manageLifecycle } from '@neo-agent/memory';

let db: DrizzleDB;

beforeEach(() => {
  db = createDatabase(':memory:');
});

describe('manageLifecycle', () => {
  it('returns zero counts on empty DB', async () => {
    const result = await manageLifecycle(db);
    expect(result.decayed).toBe(0);
    expect(result.archived).toBe(0);
    expect(result.pruned).toBe(0);
    expect(result.promoted).toBe(0);
  });

  it('promotes team facts appearing in 2+ containers', async () => {
    // Create two different containers
    const { createContainer } = await import('@neo-agent/memory');
    const c1 = createContainer(db, { paraType: 'project', name: 'Project A', scope: 'team' });
    const c2 = createContainer(db, { paraType: 'project', name: 'Project B', scope: 'team' });

    // Same content in both containers
    createFact(db, { type: 'convention', content: 'Use TypeScript strict mode', containerId: c1.id, scope: 'team' });
    createFact(db, { type: 'convention', content: 'Use TypeScript strict mode', containerId: c2.id, scope: 'team' });

    const result = await manageLifecycle(db);
    expect(result.promoted).toBe(1);

    // Should have a global fact now
    const globalFacts = listFacts(db, { scope: 'global' });
    expect(globalFacts.some(f => f.content === 'Use TypeScript strict mode')).toBe(true);
  });

  it('does not promote facts in only one container', async () => {
    const { createContainer } = await import('@neo-agent/memory');
    const c1 = createContainer(db, { paraType: 'project', name: 'Solo Project', scope: 'team' });
    createFact(db, { type: 'decision', content: 'Use Postgres', containerId: c1.id, scope: 'team' });

    const result = await manageLifecycle(db);
    expect(result.promoted).toBe(0);
  });
});
