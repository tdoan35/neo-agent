import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { CronJob } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { cronJobs } from '../schema/cron-jobs.js';

export interface CreateCronJobInput {
  name: string;
  schedule: string;
  prompt: string;
  agentId: string;
  deliverTo: string;
  enabled?: boolean;
  nextRunAt: string;
}

function toCronJob(row: typeof cronJobs.$inferSelect): CronJob {
  return {
    id: row.id,
    name: row.name,
    schedule: row.schedule,
    prompt: row.prompt,
    agentId: row.agentId,
    deliverTo: row.deliverTo,
    enabled: row.enabled,
    lastRunAt: row.lastRunAt,
    nextRunAt: row.nextRunAt,
    createdAt: row.createdAt,
  };
}

export function createCronJob(db: DrizzleDB, input: CreateCronJobInput): CronJob {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    name: input.name,
    schedule: input.schedule,
    prompt: input.prompt,
    agentId: input.agentId,
    deliverTo: input.deliverTo,
    enabled: input.enabled ?? true,
    lastRunAt: null,
    nextRunAt: input.nextRunAt,
    createdAt: now,
  };
  db.insert(cronJobs).values(row).run();
  return toCronJob(row);
}

export function getCronJob(db: DrizzleDB, id: string): CronJob {
  const row = db.select().from(cronJobs).where(eq(cronJobs.id, id)).get();
  if (!row) throw new NotFoundError('CronJob', id);
  return toCronJob(row);
}

export function enableCronJob(db: DrizzleDB, id: string): CronJob {
  db.update(cronJobs).set({ enabled: true }).where(eq(cronJobs.id, id)).run();
  return getCronJob(db, id);
}

export function disableCronJob(db: DrizzleDB, id: string): CronJob {
  db.update(cronJobs).set({ enabled: false }).where(eq(cronJobs.id, id)).run();
  return getCronJob(db, id);
}

export function listEnabledCronJobs(db: DrizzleDB): CronJob[] {
  return db.select().from(cronJobs).where(eq(cronJobs.enabled, true)).all().map(toCronJob);
}

export function updateLastRun(db: DrizzleDB, id: string, nextRunAt: string): CronJob {
  const now = new Date().toISOString();
  db.update(cronJobs).set({ lastRunAt: now, nextRunAt }).where(eq(cronJobs.id, id)).run();
  return getCronJob(db, id);
}
