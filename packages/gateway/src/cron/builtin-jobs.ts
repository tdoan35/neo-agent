import type { DrizzleDB } from '@neo-agent/memory';
import { createCronJob, listCronJobs } from '@neo-agent/memory';
import { calculateNextRun } from './scheduler.js';

interface BuiltinJobDef {
  name: string;
  schedule: string;
  prompt: string;
  agentId: string;
  deliverTo: string;
}

const BUILTIN_JOBS: BuiltinJobDef[] = [
  {
    name: 'nightly-dream',
    schedule: '0 2 * * *', // 2:00 AM daily
    prompt: '[SYSTEM] Run batch memory consolidation pipeline',
    agentId: 'system',
    deliverTo: 'log',
  },
  {
    name: 'session-count-check',
    schedule: '0 * * * *', // Every hour
    prompt: '[SYSTEM] Check if session count threshold reached for dream processing',
    agentId: 'system',
    deliverTo: 'log',
  },
];

/**
 * Ensure built-in cron jobs exist in the database.
 * Skips jobs that already exist (by name).
 */
export function ensureBuiltinJobs(db: DrizzleDB): void {
  const existing = listCronJobs(db);
  const existingNames = new Set(existing.map(j => j.name));

  for (const def of BUILTIN_JOBS) {
    if (existingNames.has(def.name)) continue;

    createCronJob(db, {
      ...def,
      enabled: true,
      nextRunAt: calculateNextRun(def.schedule),
    });
  }
}

export { BUILTIN_JOBS };
