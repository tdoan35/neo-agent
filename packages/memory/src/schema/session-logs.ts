import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const sessionLogs = sqliteTable('session_logs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  agentId: text('agent_id').notNull(),
  projectId: text('project_id'),
  surface: text('surface'), // Surface type
  turnIndex: integer('turn_index').notNull(),
  role: text('role').notNull(), // TurnRole
  content: text('content').notNull(),
  toolName: text('tool_name'),
  toolInput: text('tool_input'), // JSON
  model: text('model'),
  tokenCount: integer('token_count'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  processed: integer('processed', { mode: 'boolean' }).notNull().$defaultFn(() => false),
  processedAt: text('processed_at'),
  batchRunId: text('batch_run_id'),
});
