import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { BatchRun, BatchTrigger, BatchStatus } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { batchRuns } from '../schema/batch-runs.js';

function toBatchRun(row: typeof batchRuns.$inferSelect): BatchRun {
  return {
    id: row.id,
    triggerType: row.triggerType as BatchTrigger,
    status: row.status as BatchStatus,
    sessionsProcessed: row.sessionsProcessed,
    factsCreated: row.factsCreated,
    factsUpdated: row.factsUpdated,
    factsArchived: row.factsArchived,
    entitiesCreated: row.entitiesCreated,
    skillsCreated: row.skillsCreated,
    model: row.model,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    error: row.error,
  };
}

export function createBatchRun(db: DrizzleDB, triggerType: BatchTrigger, model: string): BatchRun {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    triggerType,
    status: 'running' as const,
    sessionsProcessed: 0,
    factsCreated: 0,
    factsUpdated: 0,
    factsArchived: 0,
    entitiesCreated: 0,
    skillsCreated: 0,
    model,
    startedAt: now,
    completedAt: null,
    error: null,
  };
  db.insert(batchRuns).values(row).run();
  return toBatchRun(row);
}

export function getBatchRun(db: DrizzleDB, id: string): BatchRun {
  const row = db.select().from(batchRuns).where(eq(batchRuns.id, id)).get();
  if (!row) throw new NotFoundError('BatchRun', id);
  return toBatchRun(row);
}

export function updateBatchRunStats(db: DrizzleDB, id: string, stats: {
  sessionsProcessed?: number;
  factsCreated?: number;
  factsUpdated?: number;
  factsArchived?: number;
  entitiesCreated?: number;
  skillsCreated?: number;
  status?: BatchStatus;
  error?: string;
}): BatchRun {
  const setValues: Record<string, unknown> = {};
  if (stats.sessionsProcessed !== undefined) setValues.sessionsProcessed = stats.sessionsProcessed;
  if (stats.factsCreated !== undefined) setValues.factsCreated = stats.factsCreated;
  if (stats.factsUpdated !== undefined) setValues.factsUpdated = stats.factsUpdated;
  if (stats.factsArchived !== undefined) setValues.factsArchived = stats.factsArchived;
  if (stats.entitiesCreated !== undefined) setValues.entitiesCreated = stats.entitiesCreated;
  if (stats.skillsCreated !== undefined) setValues.skillsCreated = stats.skillsCreated;
  if (stats.status !== undefined) {
    setValues.status = stats.status;
    if (stats.status === 'completed' || stats.status === 'failed') {
      setValues.completedAt = new Date().toISOString();
    }
  }
  if (stats.error !== undefined) setValues.error = stats.error;

  db.update(batchRuns).set(setValues).where(eq(batchRuns.id, id)).run();
  return getBatchRun(db, id);
}

export function getLatestBatchRun(db: DrizzleDB): BatchRun | null {
  const rows = db.$client.prepare('SELECT * FROM batch_runs ORDER BY started_at DESC LIMIT 1').all() as Array<Record<string, unknown>>;
  if (rows.length === 0) return null;
  const row = db.select().from(batchRuns).where(eq(batchRuns.id, rows[0].id as string)).get();
  return row ? toBatchRun(row) : null;
}
