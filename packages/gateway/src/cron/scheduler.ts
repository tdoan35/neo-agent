import type { DrizzleDB } from '@neo-agent/memory';
import type { CronJob } from '@neo-agent/shared';
import { listEnabledCronJobs, updateLastRun } from '@neo-agent/memory';
import { EventEmitter } from 'node:events';

export interface CronScheduler extends EventEmitter {
  start(): void;
  stop(): void;
  tick(): void;
}

/**
 * Parse a cron expression (minute hour dom month dow) and check if "now" matches.
 * Supports: numbers, *, and step syntax (e.g. *​/5).
 */
export function cronMatches(schedule: string, now: Date): boolean {
  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return false;

  const fields = [
    now.getMinutes(),   // 0-59
    now.getHours(),     // 0-23
    now.getDate(),      // 1-31
    now.getMonth() + 1, // 1-12
    now.getDay(),       // 0-6 (Sunday=0)
  ];

  for (let i = 0; i < 5; i++) {
    if (!fieldMatches(parts[i], fields[i])) return false;
  }
  return true;
}

function fieldMatches(pattern: string, value: number): boolean {
  if (pattern === '*') return true;

  // Step: */N
  if (pattern.startsWith('*/')) {
    const step = parseInt(pattern.slice(2), 10);
    return !isNaN(step) && step > 0 && value % step === 0;
  }

  // Comma-separated values: 1,5,10
  const values = pattern.split(',');
  return values.some(v => parseInt(v.trim(), 10) === value);
}

/** Calculate the next run time from a cron schedule (approximate — next minute check) */
export function calculateNextRun(schedule: string, from: Date = new Date()): string {
  // Simple: advance minute by minute up to 48h to find next match
  const check = new Date(from);
  check.setSeconds(0, 0);
  check.setMinutes(check.getMinutes() + 1);

  for (let i = 0; i < 2880; i++) { // 48 hours of minutes
    if (cronMatches(schedule, check)) {
      return check.toISOString();
    }
    check.setMinutes(check.getMinutes() + 1);
  }

  // Fallback: 24h from now
  const fallback = new Date(from);
  fallback.setHours(fallback.getHours() + 24);
  return fallback.toISOString();
}

export interface CronSchedulerConfig {
  checkIntervalMs?: number; // default: 60000 (1 minute)
}

/**
 * Create a cron scheduler that checks enabled jobs every minute.
 * Emits 'job' event with (job: CronJob) when a job should fire.
 */
export function createCronScheduler(
  db: DrizzleDB,
  config?: CronSchedulerConfig,
): CronScheduler {
  const checkInterval = config?.checkIntervalMs ?? 60000;
  let timer: ReturnType<typeof setInterval> | null = null;

  const scheduler = new EventEmitter() as CronScheduler;

  scheduler.tick = () => {
    const now = new Date();
    const jobs = listEnabledCronJobs(db);

    for (const job of jobs) {
      if (cronMatches(job.schedule, now)) {
        // Check if enough time has passed since last run (avoid double-firing)
        if (job.lastRunAt) {
          const lastRun = new Date(job.lastRunAt);
          const elapsed = now.getTime() - lastRun.getTime();
          if (elapsed < checkInterval) continue; // Already ran this interval
        }

        const nextRunAt = calculateNextRun(job.schedule, now);
        updateLastRun(db, job.id, nextRunAt);
        scheduler.emit('job', job);
      }
    }
  };

  scheduler.start = () => {
    if (timer) return;
    timer = setInterval(() => scheduler.tick(), checkInterval);
  };

  scheduler.stop = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  };

  return scheduler;
}
