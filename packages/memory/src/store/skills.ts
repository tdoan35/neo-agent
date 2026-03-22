import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { Skill, AccessScope } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { skills } from '../schema/skills.js';

export interface CreateSkillInput {
  name: string;
  description?: string;
  filePath: string;
  category?: string;
  tags?: string[];
  relatedEntityIds?: string[];
  scope?: AccessScope;
  projectId?: string;
  synthesizedFrom?: string[];
  confidence?: number;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  category?: string;
  tags?: string[];
}

function toSkill(row: typeof skills.$inferSelect): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    filePath: row.filePath,
    category: row.category,
    tags: JSON.parse(row.tags) as string[],
    relatedEntityIds: JSON.parse(row.relatedEntityIds) as string[],
    timesUsed: row.timesUsed,
    lastUsedAt: row.lastUsedAt,
    successRate: row.successRate,
    scope: row.scope as AccessScope,
    projectId: row.projectId,
    synthesizedFrom: row.synthesizedFrom ? JSON.parse(row.synthesizedFrom) as string[] : null,
    confidence: row.confidence,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createSkill(db: DrizzleDB, input: CreateSkillInput): Skill {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    name: input.name,
    description: input.description ?? null,
    filePath: input.filePath,
    category: input.category ?? null,
    tags: JSON.stringify(input.tags ?? []),
    relatedEntityIds: JSON.stringify(input.relatedEntityIds ?? []),
    timesUsed: 0,
    lastUsedAt: null,
    successRate: null,
    scope: input.scope ?? 'global',
    projectId: input.projectId ?? null,
    synthesizedFrom: input.synthesizedFrom ? JSON.stringify(input.synthesizedFrom) : null,
    confidence: input.confidence ?? 1.0,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(skills).values(row).run();
  return toSkill(row);
}

export function getSkill(db: DrizzleDB, id: string): Skill {
  const row = db.select().from(skills).where(eq(skills.id, id)).get();
  if (!row) throw new NotFoundError('Skill', id);
  return toSkill(row);
}

export function updateSkill(db: DrizzleDB, id: string, updates: UpdateSkillInput): Skill {
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };
  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.description !== undefined) setValues.description = updates.description;
  if (updates.category !== undefined) setValues.category = updates.category;
  if (updates.tags !== undefined) setValues.tags = JSON.stringify(updates.tags);

  db.update(skills).set(setValues).where(eq(skills.id, id)).run();
  return getSkill(db, id);
}

export function incrementUsage(db: DrizzleDB, id: string, success: boolean): void {
  const row = db.select().from(skills).where(eq(skills.id, id)).get();
  if (!row) throw new NotFoundError('Skill', id);

  const now = new Date().toISOString();
  const newTimesUsed = row.timesUsed + 1;
  const currentSuccesses = row.successRate !== null ? Math.round(row.successRate * row.timesUsed) : 0;
  const newSuccesses = currentSuccesses + (success ? 1 : 0);
  const newSuccessRate = newSuccesses / newTimesUsed;

  db.update(skills)
    .set({ timesUsed: newTimesUsed, lastUsedAt: now, successRate: newSuccessRate, updatedAt: now })
    .where(eq(skills.id, id))
    .run();
}

export function listSkills(db: DrizzleDB, filters?: {
  category?: string;
  tags?: string[];
}): Skill[] {
  const conditions = [];
  if (filters?.category) conditions.push(eq(skills.category, filters.category));

  const query = conditions.length > 0
    ? db.select().from(skills).where(and(...conditions))
    : db.select().from(skills);

  let results = query.all().map(toSkill);

  // Filter by tags in application layer (JSON array in SQLite)
  if (filters?.tags && filters.tags.length > 0) {
    results = results.filter(skill =>
      filters.tags!.some(tag => skill.tags.includes(tag))
    );
  }

  return results;
}
