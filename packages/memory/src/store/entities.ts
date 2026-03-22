import { eq, and, like } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { Entity, EntityType, AccessScope } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { entities } from '../schema/entities.js';

export interface CreateEntityInput {
  type: EntityType;
  name: string;
  aliases?: string[];
  description?: string;
  containerId?: string;
  scope?: AccessScope;
  projectId?: string;
  ownerAgent?: string;
  sourceSessionId?: string;
  confidence?: number;
}

export interface UpdateEntityInput {
  name?: string;
  aliases?: string[];
  description?: string;
  containerId?: string;
  type?: EntityType;
  scope?: AccessScope;
}

function toEntity(row: typeof entities.$inferSelect): Entity {
  return {
    id: row.id,
    type: row.type as EntityType,
    name: row.name,
    aliases: JSON.parse(row.aliases) as string[],
    description: row.description,
    containerId: row.containerId,
    scope: row.scope as AccessScope,
    projectId: row.projectId,
    ownerAgent: row.ownerAgent,
    sourceSessionId: row.sourceSessionId,
    lastAccessedAt: row.lastAccessedAt,
    confidence: row.confidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createEntity(db: DrizzleDB, input: CreateEntityInput): Entity {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    type: input.type,
    name: input.name,
    aliases: JSON.stringify(input.aliases ?? []),
    description: input.description ?? null,
    containerId: input.containerId ?? null,
    scope: input.scope ?? 'global',
    projectId: input.projectId ?? null,
    ownerAgent: input.ownerAgent ?? null,
    sourceSessionId: input.sourceSessionId ?? null,
    lastAccessedAt: null,
    confidence: input.confidence ?? 1.0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(entities).values(row).run();
  return toEntity(row);
}

export function getEntity(db: DrizzleDB, id: string): Entity {
  const row = db.select().from(entities).where(eq(entities.id, id)).get();
  if (!row) throw new NotFoundError('Entity', id);
  return toEntity(row);
}

export function updateEntity(db: DrizzleDB, id: string, updates: UpdateEntityInput): Entity {
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };
  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.aliases !== undefined) setValues.aliases = JSON.stringify(updates.aliases);
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.containerId !== undefined) setValues.containerId = updates.containerId;
  if (updates.type !== undefined) setValues.type = updates.type;
  if (updates.scope !== undefined) setValues.scope = updates.scope;

  db.update(entities).set(setValues).where(eq(entities.id, id)).run();
  return getEntity(db, id);
}

export function findEntityByAlias(db: DrizzleDB, alias: string, scope?: AccessScope): Entity | null {
  // Check name first
  const conditions = [eq(entities.name, alias)];
  if (scope) conditions.push(eq(entities.scope, scope));

  const byName = db.select().from(entities).where(and(...conditions)).get();
  if (byName) return toEntity(byName);

  // Search aliases JSON — SQLite LIKE on JSON array
  const allEntities = scope
    ? db.select().from(entities).where(eq(entities.scope, scope)).all()
    : db.select().from(entities).all();

  for (const row of allEntities) {
    const aliases = JSON.parse(row.aliases) as string[];
    if (aliases.some(a => a.toLowerCase() === alias.toLowerCase())) {
      return toEntity(row);
    }
  }

  return null;
}

export function listEntities(db: DrizzleDB, filters?: {
  type?: EntityType;
  containerId?: string;
  scope?: AccessScope;
}): Entity[] {
  const conditions = [];
  if (filters?.type) conditions.push(eq(entities.type, filters.type));
  if (filters?.containerId) conditions.push(eq(entities.containerId, filters.containerId));
  if (filters?.scope) conditions.push(eq(entities.scope, filters.scope));

  const query = conditions.length > 0
    ? db.select().from(entities).where(and(...conditions))
    : db.select().from(entities);

  return query.all().map(toEntity);
}

export function touchEntity(db: DrizzleDB, id: string): void {
  const now = new Date().toISOString();
  db.update(entities).set({ lastAccessedAt: now, updatedAt: now }).where(eq(entities.id, id)).run();
}
