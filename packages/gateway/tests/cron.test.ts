import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createDatabase, type DrizzleDB, createCronJob, listCronJobs, listEnabledCronJobs } from '@neo-agent/memory';
import { cronMatches, calculateNextRun, createCronScheduler, type CronScheduler } from '../src/cron/scheduler.js';
import { ensureBuiltinJobs } from '../src/cron/builtin-jobs.js';

let db: DrizzleDB;
let scheduler: CronScheduler | null = null;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  scheduler?.stop();
  scheduler = null;
});

describe('cronMatches', () => {
  it('matches wildcard pattern (* * * * *)', () => {
    expect(cronMatches('* * * * *', new Date())).toBe(true);
  });

  it('matches specific minute', () => {
    const d = new Date('2026-03-21T10:30:00Z');
    expect(cronMatches('30 * * * *', d)).toBe(true);
    expect(cronMatches('15 * * * *', d)).toBe(false);
  });

  it('matches specific hour and minute', () => {
    // Create a date at local 2:00 AM
    const d = new Date(2026, 2, 21, 2, 0, 0);
    expect(cronMatches('0 2 * * *', d)).toBe(true);
    expect(cronMatches('0 3 * * *', d)).toBe(false);
  });

  it('matches step pattern (*/5)', () => {
    const d0 = new Date('2026-03-21T10:00:00Z');
    const d5 = new Date('2026-03-21T10:05:00Z');
    const d7 = new Date('2026-03-21T10:07:00Z');
    expect(cronMatches('*/5 * * * *', d0)).toBe(true);
    expect(cronMatches('*/5 * * * *', d5)).toBe(true);
    expect(cronMatches('*/5 * * * *', d7)).toBe(false);
  });

  it('matches comma-separated values', () => {
    const d = new Date('2026-03-21T10:15:00Z');
    expect(cronMatches('15,30,45 * * * *', d)).toBe(true);
    expect(cronMatches('0,20,40 * * * *', d)).toBe(false);
  });

  it('matches day of week', () => {
    // 2026-03-21 is a Saturday (day 6)
    const d = new Date(2026, 2, 21, 10, 0, 0); // local time
    expect(cronMatches(`0 10 * * ${d.getDay()}`, d)).toBe(true);
    expect(cronMatches(`0 10 * * ${(d.getDay() + 1) % 7}`, d)).toBe(false);
  });

  it('rejects invalid patterns', () => {
    expect(cronMatches('invalid', new Date())).toBe(false);
    expect(cronMatches('* * *', new Date())).toBe(false);
  });
});

describe('calculateNextRun', () => {
  it('calculates next run for hourly schedule', () => {
    const from = new Date('2026-03-21T10:30:00Z');
    const next = calculateNextRun('0 * * * *', from);
    expect(new Date(next).getMinutes()).toBe(0);
    expect(new Date(next) > from).toBe(true);
  });

  it('calculates next run for daily schedule', () => {
    const from = new Date(2026, 2, 21, 10, 0, 0);
    const next = calculateNextRun('0 2 * * *', from);
    const nextDate = new Date(next);
    expect(nextDate.getHours()).toBe(2);
    expect(nextDate.getMinutes()).toBe(0);
    expect(nextDate > from).toBe(true);
  });
});

describe('createCronScheduler', () => {
  it('emits job event when schedule matches on tick', async () => {
    const now = new Date();
    createCronJob(db, {
      name: 'test-job',
      schedule: '* * * * *', // Every minute
      prompt: 'test prompt',
      agentId: 'test',
      deliverTo: 'log',
      nextRunAt: now.toISOString(),
    });

    scheduler = createCronScheduler(db, { checkIntervalMs: 100 });

    const jobPromise = new Promise<any>((resolve) => {
      scheduler!.on('job', resolve);
    });

    // Manually tick
    scheduler.tick();

    const job = await jobPromise;
    expect(job.name).toBe('test-job');
  });
});

describe('ensureBuiltinJobs', () => {
  it('creates builtin jobs when none exist', () => {
    ensureBuiltinJobs(db);
    const jobs = listCronJobs(db);
    expect(jobs.length).toBeGreaterThanOrEqual(2);
    expect(jobs.some(j => j.name === 'nightly-dream')).toBe(true);
    expect(jobs.some(j => j.name === 'session-count-check')).toBe(true);
  });

  it('does not duplicate jobs on second call', () => {
    ensureBuiltinJobs(db);
    const count1 = listCronJobs(db).length;
    ensureBuiltinJobs(db);
    const count2 = listCronJobs(db).length;
    expect(count2).toBe(count1);
  });
});
