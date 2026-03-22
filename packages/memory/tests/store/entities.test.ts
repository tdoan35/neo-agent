import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import { createEntity, getEntity, updateEntity, findEntityByAlias, listEntities, touchEntity } from '@neo-agent/memory';
import { NotFoundError } from '@neo-agent/shared';

let db: DrizzleDB;
beforeEach(() => { db = createDatabase(':memory:'); });

describe('entities store', () => {
  it('creates an entity with aliases', () => {
    const e = createEntity(db, { type: 'person', name: 'Alice Chen', aliases: ['Alice', 'the frontend lead'] });
    expect(e.name).toBe('Alice Chen');
    expect(e.aliases).toEqual(['Alice', 'the frontend lead']);
    expect(e.confidence).toBe(1.0);
  });

  it('finds entity by name', () => {
    createEntity(db, { type: 'tool', name: 'pnpm' });
    const found = findEntityByAlias(db, 'pnpm');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('pnpm');
  });

  it('finds entity by alias (case-insensitive)', () => {
    createEntity(db, { type: 'person', name: 'Alice Chen', aliases: ['Alice', 'the frontend lead'] });
    const found = findEntityByAlias(db, 'alice');
    expect(found).not.toBeNull();
    expect(found!.name).toBe('Alice Chen');
  });

  it('returns null for unknown alias', () => {
    expect(findEntityByAlias(db, 'nonexistent')).toBeNull();
  });

  it('finds entity by alias with scope filter', () => {
    createEntity(db, { type: 'tool', name: 'pnpm', scope: 'global' });
    createEntity(db, { type: 'tool', name: 'yarn', scope: 'private' });

    expect(findEntityByAlias(db, 'pnpm', 'global')).not.toBeNull();
    expect(findEntityByAlias(db, 'yarn', 'global')).toBeNull();
  });

  it('updates entity aliases', () => {
    const e = createEntity(db, { type: 'person', name: 'Bob' });
    const updated = updateEntity(db, e.id, { aliases: ['Bobby', 'Robert'] });
    expect(updated.aliases).toEqual(['Bobby', 'Robert']);
  });

  it('lists entities by type', () => {
    createEntity(db, { type: 'person', name: 'A' });
    createEntity(db, { type: 'person', name: 'B' });
    createEntity(db, { type: 'tool', name: 'C' });

    expect(listEntities(db, { type: 'person' })).toHaveLength(2);
    expect(listEntities(db, { type: 'tool' })).toHaveLength(1);
  });

  it('touchEntity updates lastAccessedAt', () => {
    const e = createEntity(db, { type: 'concept', name: 'testing' });
    expect(e.lastAccessedAt).toBeNull();

    touchEntity(db, e.id);
    const touched = getEntity(db, e.id);
    expect(touched.lastAccessedAt).toBeDefined();
  });
});
