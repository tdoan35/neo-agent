import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';

export const entities = sqliteTable('entities', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // EntityType
  name: text('name').notNull(),
  aliases: text('aliases').notNull().$defaultFn(() => '[]'), // JSON array
  description: text('description'),
  containerId: text('container_id'),
  scope: text('scope').notNull().$defaultFn(() => 'global'),
  projectId: text('project_id'),
  ownerAgent: text('owner_agent'),
  sourceSessionId: text('source_session_id'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  lastAccessedAt: text('last_accessed_at'),
  confidence: real('confidence').notNull().$defaultFn(() => 1.0),
});
