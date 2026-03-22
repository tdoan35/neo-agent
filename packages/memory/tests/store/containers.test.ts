import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import { createContainer, getContainer, updateContainer, archiveContainer, listContainers, getChildContainers } from '@neo-agent/memory';
import { NotFoundError } from '@neo-agent/shared';

let db: DrizzleDB;
beforeEach(() => { db = createDatabase(':memory:'); });

describe('containers store', () => {
  it('creates a container with defaults', () => {
    const c = createContainer(db, { paraType: 'project', name: 'Test' });
    expect(c.id).toBeDefined();
    expect(c.paraType).toBe('project');
    expect(c.name).toBe('Test');
    expect(c.status).toBe('active');
    expect(c.scope).toBe('private');
    expect(c.createdAt).toBeDefined();
  });

  it('gets a container by id', () => {
    const c = createContainer(db, { paraType: 'area', name: 'Career' });
    const fetched = getContainer(db, c.id);
    expect(fetched.name).toBe('Career');
  });

  it('throws NotFoundError for missing id', () => {
    expect(() => getContainer(db, 'nonexistent')).toThrow(NotFoundError);
  });

  it('updates a container', () => {
    const c = createContainer(db, { paraType: 'project', name: 'Old' });
    const updated = updateContainer(db, c.id, { name: 'New', status: 'paused' });
    expect(updated.name).toBe('New');
    expect(updated.status).toBe('paused');
    expect(updated.updatedAt).toBeDefined();
  });

  it('archives a container', () => {
    const c = createContainer(db, { paraType: 'project', name: 'Done' });
    const archived = archiveContainer(db, c.id);
    expect(archived.status).toBe('archived');
    expect(archived.archivedAt).toBeDefined();
  });

  it('lists containers with filters', () => {
    createContainer(db, { paraType: 'project', name: 'P1' });
    createContainer(db, { paraType: 'area', name: 'A1' });
    createContainer(db, { paraType: 'project', name: 'P2' });

    expect(listContainers(db, { paraType: 'project' })).toHaveLength(2);
    expect(listContainers(db, { paraType: 'area' })).toHaveLength(1);
    expect(listContainers(db)).toHaveLength(3);
  });

  it('gets child containers', () => {
    const parent = createContainer(db, { paraType: 'area', name: 'Parent' });
    createContainer(db, { paraType: 'project', name: 'Child1', parentId: parent.id });
    createContainer(db, { paraType: 'project', name: 'Child2', parentId: parent.id });
    createContainer(db, { paraType: 'project', name: 'Other' });

    expect(getChildContainers(db, parent.id)).toHaveLength(2);
  });
});
