import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const cronJobs = sqliteTable('cron_jobs', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  schedule: text('schedule').notNull(), // Cron expression
  prompt: text('prompt').notNull(),
  agentId: text('agent_id').notNull(),
  deliverTo: text('deliver_to').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().$defaultFn(() => true),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
