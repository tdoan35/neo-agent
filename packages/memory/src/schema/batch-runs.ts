import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const batchRuns = sqliteTable('batch_runs', {
  id: text('id').primaryKey(),
  triggerType: text('trigger_type').notNull(), // BatchTrigger
  status: text('status').notNull().$defaultFn(() => 'running'), // BatchStatus
  sessionsProcessed: integer('sessions_processed').notNull().$defaultFn(() => 0),
  factsCreated: integer('facts_created').notNull().$defaultFn(() => 0),
  factsUpdated: integer('facts_updated').notNull().$defaultFn(() => 0),
  factsArchived: integer('facts_archived').notNull().$defaultFn(() => 0),
  entitiesCreated: integer('entities_created').notNull().$defaultFn(() => 0),
  skillsCreated: integer('skills_created').notNull().$defaultFn(() => 0),
  model: text('model').notNull(),
  startedAt: text('started_at').notNull().$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
  error: text('error'),
});
