import { eq, and, gte } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { Fact, FactType, AccessScope, SourceType } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { facts } from '../schema/facts.js';

export interface CreateFactInput {
  entityId?: string;
  containerId?: string;
  type: FactType;
  content: string;
  structured?: Record<string, unknown>;
  scope?: AccessScope;
  projectId?: string;
  ownerAgent?: string;
  sourceSessionId?: string;
  sourceType?: SourceType;
  extractedBy?: string;
  confidence?: number;
  decayRate?: number;
  expiresAt?: string;
}

export interface UpdateFactInput {
  content?: string;
  structured?: Record<string, unknown>;
  type?: FactType;
  scope?: AccessScope;
  confidence?: number;
  decayRate?: number;
}

function toFact(row: typeof facts.$inferSelect): Fact {
  return {
    id: row.id,
    entityId: row.entityId,
    containerId: row.containerId,
    type: row.type as FactType,
    content: row.content,
    structured: row.structured ? JSON.parse(row.structured) as Record<string, unknown> : null,
    scope: row.scope as AccessScope,
    projectId: row.projectId,
    ownerAgent: row.ownerAgent,
    sourceSessionId: row.sourceSessionId,
    sourceType: row.sourceType as SourceType,
    extractedBy: row.extractedBy,
    confidence: row.confidence,
    decayRate: row.decayRate,
    lastConfirmedAt: row.lastConfirmedAt,
    lastAccessedAt: row.lastAccessedAt,
    expiresAt: row.expiresAt,
    supersedesFactId: row.supersedesFactId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createFact(db: DrizzleDB, input: CreateFactInput): Fact {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    entityId: input.entityId ?? null,
    containerId: input.containerId ?? null,
    type: input.type,
    content: input.content,
    structured: input.structured ? JSON.stringify(input.structured) : null,
    scope: input.scope ?? 'global',
    projectId: input.projectId ?? null,
    ownerAgent: input.ownerAgent ?? null,
    sourceSessionId: input.sourceSessionId ?? null,
    sourceType: input.sourceType ?? 'stated',
    extractedBy: input.extractedBy ?? null,
    confidence: input.confidence ?? 1.0,
    decayRate: input.decayRate ?? 0.02,
    lastConfirmedAt: null,
    lastAccessedAt: null,
    expiresAt: input.expiresAt ?? null,
    supersedesFactId: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(facts).values(row).run();
  return toFact(row);
}

export function getFact(db: DrizzleDB, id: string): Fact {
  const row = db.select().from(facts).where(eq(facts.id, id)).get();
  if (!row) throw new NotFoundError('Fact', id);
  return toFact(row);
}

export function updateFact(db: DrizzleDB, id: string, updates: UpdateFactInput): Fact {
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };
  if (updates.content !== undefined) setValues.content = updates.content;
  if (updates.structured !== undefined) setValues.structured = JSON.stringify(updates.structured);
  if (updates.type !== undefined) setValues.type = updates.type;
  if (updates.scope !== undefined) setValues.scope = updates.scope;
  if (updates.confidence !== undefined) setValues.confidence = updates.confidence;
  if (updates.decayRate !== undefined) setValues.decayRate = updates.decayRate;

  db.update(facts).set(setValues).where(eq(facts.id, id)).run();
  return getFact(db, id);
}

export function supersedeFact(db: DrizzleDB, oldFactId: string, newInput: CreateFactInput): Fact {
  const now = new Date().toISOString();
  const newId = randomUUID();
  const row = {
    id: newId,
    entityId: newInput.entityId ?? null,
    containerId: newInput.containerId ?? null,
    type: newInput.type,
    content: newInput.content,
    structured: newInput.structured ? JSON.stringify(newInput.structured) : null,
    scope: newInput.scope ?? 'global',
    projectId: newInput.projectId ?? null,
    ownerAgent: newInput.ownerAgent ?? null,
    sourceSessionId: newInput.sourceSessionId ?? null,
    sourceType: newInput.sourceType ?? 'stated',
    extractedBy: newInput.extractedBy ?? null,
    confidence: newInput.confidence ?? 1.0,
    decayRate: newInput.decayRate ?? 0.02,
    lastConfirmedAt: null,
    lastAccessedAt: null,
    expiresAt: newInput.expiresAt ?? null,
    supersedesFactId: oldFactId,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(facts).values(row).run();
  return toFact(row);
}

export function listFacts(db: DrizzleDB, filters?: {
  entityId?: string;
  containerId?: string;
  scope?: AccessScope;
  type?: FactType;
  minConfidence?: number;
}): Fact[] {
  const conditions = [];
  if (filters?.entityId) conditions.push(eq(facts.entityId, filters.entityId));
  if (filters?.containerId) conditions.push(eq(facts.containerId, filters.containerId));
  if (filters?.scope) conditions.push(eq(facts.scope, filters.scope));
  if (filters?.type) conditions.push(eq(facts.type, filters.type));
  if (filters?.minConfidence !== undefined) conditions.push(gte(facts.confidence, filters.minConfidence));

  const query = conditions.length > 0
    ? db.select().from(facts).where(and(...conditions))
    : db.select().from(facts);

  return query.all().map(toFact);
}

export function touchFact(db: DrizzleDB, id: string): void {
  const row = db.select().from(facts).where(eq(facts.id, id)).get();
  if (!row) throw new NotFoundError('Fact', id);

  const now = new Date().toISOString();
  const boostedConfidence = Math.min(1.0, row.confidence + 0.05);
  db.update(facts)
    .set({ lastAccessedAt: now, confidence: boostedConfidence, updatedAt: now })
    .where(eq(facts.id, id))
    .run();
}

export function confirmFact(db: DrizzleDB, id: string): void {
  const now = new Date().toISOString();
  db.update(facts)
    .set({ lastConfirmedAt: now, confidence: 1.0, updatedAt: now })
    .where(eq(facts.id, id))
    .run();
}

export function calculateDecay(fact: Fact, now: Date): number {
  const lastConfirmed = fact.lastConfirmedAt ? new Date(fact.lastConfirmedAt).getTime() : new Date(fact.createdAt).getTime();
  const lastAccessed = fact.lastAccessedAt ? new Date(fact.lastAccessedAt).getTime() : new Date(fact.createdAt).getTime();
  const lastActivity = Math.max(lastConfirmed, lastAccessed);
  const daysSinceActivity = (now.getTime() - lastActivity) / (1000 * 60 * 60 * 24);

  return Math.max(0, fact.confidence * Math.pow(1 - fact.decayRate, daysSinceActivity));
}

export function applyDecay(db: DrizzleDB, factId: string, now: Date): Fact {
  const fact = getFact(db, factId);
  const newConfidence = calculateDecay(fact, now);
  db.update(facts)
    .set({ confidence: newConfidence, updatedAt: now.toISOString() })
    .where(eq(facts.id, factId))
    .run();
  return getFact(db, factId);
}

export function bulkApplyDecay(db: DrizzleDB, now: Date): { updated: number; archived: number; pruned: number } {
  const allFacts = db.select().from(facts).all();
  let updated = 0;
  let archived = 0;
  let pruned = 0;

  for (const row of allFacts) {
    if (row.scope === 'archive') continue;

    const fact = toFact(row);
    const newConfidence = calculateDecay(fact, now);

    if (newConfidence < 0.01) {
      db.delete(facts).where(eq(facts.id, row.id)).run();
      pruned++;
    } else if (newConfidence < 0.1) {
      db.update(facts)
        .set({ confidence: newConfidence, scope: 'archive', updatedAt: now.toISOString() })
        .where(eq(facts.id, row.id))
        .run();
      archived++;
    } else if (newConfidence !== row.confidence) {
      db.update(facts)
        .set({ confidence: newConfidence, updatedAt: now.toISOString() })
        .where(eq(facts.id, row.id))
        .run();
      updated++;
    }
  }

  return { updated, archived, pruned };
}
