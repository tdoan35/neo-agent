import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { WorkingMemoryTask, TaskState, AccessScope } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { workingMemory } from '../schema/working-memory.js';

export interface CreateTaskInput {
  agentId: string;
  projectId?: string;
  title: string;
  state?: TaskState;
  scope?: AccessScope;
  ownerAgent?: string;
}

export interface UpdateTaskInput {
  title?: string;
  context?: Record<string, unknown>;
  blockers?: string | null;
  handoffSummary?: string;
}

function toTask(row: typeof workingMemory.$inferSelect): WorkingMemoryTask {
  return {
    id: row.id,
    agentId: row.agentId,
    projectId: row.projectId,
    title: row.title,
    state: row.state as TaskState,
    context: row.context ? JSON.parse(row.context) as Record<string, unknown> : null,
    decisions: JSON.parse(row.decisions) as Array<{ content: string; timestamp: string }>,
    blockers: row.blockers,
    openQuestions: JSON.parse(row.openQuestions) as string[],
    handoffSummary: row.handoffSummary,
    scope: row.scope as AccessScope,
    ownerAgent: row.ownerAgent,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createTask(db: DrizzleDB, input: CreateTaskInput): WorkingMemoryTask {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    agentId: input.agentId,
    projectId: input.projectId ?? null,
    title: input.title,
    state: input.state ?? 'backlog',
    context: null,
    decisions: '[]',
    blockers: null,
    openQuestions: '[]',
    handoffSummary: null,
    scope: input.scope ?? 'private',
    ownerAgent: input.ownerAgent ?? null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
  db.insert(workingMemory).values(row).run();
  return toTask(row);
}

export function getTask(db: DrizzleDB, id: string): WorkingMemoryTask {
  const row = db.select().from(workingMemory).where(eq(workingMemory.id, id)).get();
  if (!row) throw new NotFoundError('Task', id);
  return toTask(row);
}

export function updateTask(db: DrizzleDB, id: string, updates: UpdateTaskInput): WorkingMemoryTask {
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };
  if (updates.title !== undefined) setValues.title = updates.title;
  if (updates.context !== undefined) setValues.context = JSON.stringify(updates.context);
  if (updates.blockers !== undefined) setValues.blockers = updates.blockers;
  if (updates.handoffSummary !== undefined) setValues.handoffSummary = updates.handoffSummary;

  db.update(workingMemory).set(setValues).where(eq(workingMemory.id, id)).run();
  return getTask(db, id);
}

export function listTasks(db: DrizzleDB, filters?: {
  agentId?: string;
  projectId?: string;
  state?: TaskState;
}): WorkingMemoryTask[] {
  const conditions = [];
  if (filters?.agentId) conditions.push(eq(workingMemory.agentId, filters.agentId));
  if (filters?.projectId) conditions.push(eq(workingMemory.projectId, filters.projectId));
  if (filters?.state) conditions.push(eq(workingMemory.state, filters.state));

  const query = conditions.length > 0
    ? db.select().from(workingMemory).where(and(...conditions))
    : db.select().from(workingMemory);

  return query.all().map(toTask);
}
