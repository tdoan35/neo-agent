import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { Container, ParaType, ContainerStatus, AccessScope } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { containers } from '../schema/containers.js';

export interface CreateContainerInput {
  paraType: ParaType;
  name: string;
  description?: string;
  outcome?: string;
  deadline?: string;
  status?: ContainerStatus;
  areaOfLife?: string;
  parentId?: string;
  scope?: AccessScope;
  ownerAgent?: string;
}

export interface UpdateContainerInput {
  name?: string;
  description?: string;
  outcome?: string;
  deadline?: string;
  status?: ContainerStatus;
  areaOfLife?: string;
  parentId?: string;
  scope?: AccessScope;
}

function toContainer(row: typeof containers.$inferSelect): Container {
  return {
    id: row.id,
    paraType: row.paraType as ParaType,
    name: row.name,
    description: row.description,
    outcome: row.outcome,
    deadline: row.deadline,
    status: row.status as ContainerStatus,
    areaOfLife: row.areaOfLife,
    parentId: row.parentId,
    scope: row.scope as AccessScope,
    ownerAgent: row.ownerAgent,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createContainer(db: DrizzleDB, input: CreateContainerInput): Container {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    paraType: input.paraType,
    name: input.name,
    description: input.description ?? null,
    outcome: input.outcome ?? null,
    deadline: input.deadline ?? null,
    status: input.status ?? 'active',
    areaOfLife: input.areaOfLife ?? null,
    parentId: input.parentId ?? null,
    scope: input.scope ?? 'private',
    ownerAgent: input.ownerAgent ?? null,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
  db.insert(containers).values(row).run();
  return toContainer(row);
}

export function getContainer(db: DrizzleDB, id: string): Container {
  const row = db.select().from(containers).where(eq(containers.id, id)).get();
  if (!row) throw new NotFoundError('Container', id);
  return toContainer(row);
}

export function updateContainer(db: DrizzleDB, id: string, updates: UpdateContainerInput): Container {
  const now = new Date().toISOString();
  db.update(containers)
    .set({ ...updates, updatedAt: now })
    .where(eq(containers.id, id))
    .run();
  return getContainer(db, id);
}

export function archiveContainer(db: DrizzleDB, id: string): Container {
  const now = new Date().toISOString();
  db.update(containers)
    .set({ status: 'archived', archivedAt: now, updatedAt: now })
    .where(eq(containers.id, id))
    .run();
  return getContainer(db, id);
}

export function listContainers(db: DrizzleDB, filters?: {
  paraType?: ParaType;
  status?: ContainerStatus;
  scope?: AccessScope;
}): Container[] {
  const conditions = [];
  if (filters?.paraType) conditions.push(eq(containers.paraType, filters.paraType));
  if (filters?.status) conditions.push(eq(containers.status, filters.status));
  if (filters?.scope) conditions.push(eq(containers.scope, filters.scope));

  const query = conditions.length > 0
    ? db.select().from(containers).where(and(...conditions))
    : db.select().from(containers);

  return query.all().map(toContainer);
}

export function getChildContainers(db: DrizzleDB, parentId: string): Container[] {
  return db.select().from(containers).where(eq(containers.parentId, parentId)).all().map(toContainer);
}
