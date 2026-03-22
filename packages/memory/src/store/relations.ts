import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { Relation, RelationType, AccessScope } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { relations as relationsTable } from '../schema/relations.js';

export interface CreateRelationInput {
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  label?: string;
  directional?: boolean;
  scope?: AccessScope;
  projectId?: string;
  confidence?: number;
}

function toRelation(row: typeof relationsTable.$inferSelect): Relation {
  return {
    id: row.id,
    sourceEntityId: row.sourceEntityId,
    targetEntityId: row.targetEntityId,
    type: row.type as RelationType,
    label: row.label,
    directional: row.directional,
    scope: row.scope as AccessScope,
    projectId: row.projectId,
    confidence: row.confidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createRelation(db: DrizzleDB, input: CreateRelationInput): Relation {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    sourceEntityId: input.sourceEntityId,
    targetEntityId: input.targetEntityId,
    type: input.type,
    label: input.label ?? null,
    directional: input.directional ?? true,
    scope: input.scope ?? 'global',
    projectId: input.projectId ?? null,
    confidence: input.confidence ?? 1.0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(relationsTable).values(row).run();
  return toRelation(row);
}

export function getRelation(db: DrizzleDB, id: string): Relation {
  const row = db.select().from(relationsTable).where(eq(relationsTable.id, id)).get();
  if (!row) throw new NotFoundError('Relation', id);
  return toRelation(row);
}

export function listRelations(db: DrizzleDB, filters?: {
  sourceEntityId?: string;
  targetEntityId?: string;
  type?: RelationType;
}): Relation[] {
  const conditions = [];
  if (filters?.sourceEntityId) conditions.push(eq(relationsTable.sourceEntityId, filters.sourceEntityId));
  if (filters?.targetEntityId) conditions.push(eq(relationsTable.targetEntityId, filters.targetEntityId));
  if (filters?.type) conditions.push(eq(relationsTable.type, filters.type));

  const query = conditions.length > 0
    ? db.select().from(relationsTable).where(and(...conditions))
    : db.select().from(relationsTable);

  return query.all().map(toRelation);
}

export function deleteRelation(db: DrizzleDB, id: string): void {
  db.delete(relationsTable).where(eq(relationsTable.id, id)).run();
}
