import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const containers = sqliteTable('containers', {
  id: text('id').primaryKey(),
  paraType: text('para_type').notNull(), // 'project' | 'area' | 'resource' | 'archive'
  name: text('name').notNull(),
  description: text('description'),
  outcome: text('outcome'),
  deadline: text('deadline'),
  status: text('status').notNull().$defaultFn(() => 'active'),
  areaOfLife: text('area_of_life'),
  parentId: text('parent_id'),
  scope: text('scope').notNull().$defaultFn(() => 'private'),
  ownerAgent: text('owner_agent'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  archivedAt: text('archived_at'),
});
