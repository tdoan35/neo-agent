import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workingMemory = sqliteTable('working_memory', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  projectId: text('project_id'),
  title: text('title').notNull(),
  state: text('state').notNull().$defaultFn(() => 'backlog'), // TaskState
  context: text('context'), // JSON object
  decisions: text('decisions').notNull().$defaultFn(() => '[]'), // JSON array
  blockers: text('blockers'),
  openQuestions: text('open_questions').notNull().$defaultFn(() => '[]'), // JSON array
  handoffSummary: text('handoff_summary'),
  scope: text('scope').notNull().$defaultFn(() => 'private'),
  ownerAgent: text('owner_agent'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  completedAt: text('completed_at'),
});
