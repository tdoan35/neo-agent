import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const skills = sqliteTable('skills', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  filePath: text('file_path').notNull(),
  category: text('category'),
  tags: text('tags').notNull().$defaultFn(() => '[]'), // JSON array
  relatedEntityIds: text('related_entity_ids').notNull().$defaultFn(() => '[]'), // JSON array
  timesUsed: integer('times_used').notNull().$defaultFn(() => 0),
  lastUsedAt: text('last_used_at'),
  successRate: real('success_rate'),
  scope: text('scope').notNull().$defaultFn(() => 'global'),
  projectId: text('project_id'),
  synthesizedFrom: text('synthesized_from'), // JSON array of session IDs
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  confidence: real('confidence').notNull().$defaultFn(() => 1.0),
});
