import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const entityContainers = sqliteTable('entity_containers', {
  id: text('id').primaryKey(),
  entityId: text('entity_id').notNull(),
  containerId: text('container_id').notNull(),
  role: text('role'),
  addedAt: text('added_at').notNull().$defaultFn(() => new Date().toISOString()),
});
