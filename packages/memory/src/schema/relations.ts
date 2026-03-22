import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const relations = sqliteTable('relations', {
  id: text('id').primaryKey(),
  sourceEntityId: text('source_entity_id').notNull(),
  targetEntityId: text('target_entity_id').notNull(),
  type: text('type').notNull(), // RelationType
  label: text('label'),
  directional: integer('directional', { mode: 'boolean' }).notNull().$defaultFn(() => true),
  scope: text('scope').notNull().$defaultFn(() => 'global'),
  projectId: text('project_id'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  confidence: real('confidence').notNull().$defaultFn(() => 1.0),
});
