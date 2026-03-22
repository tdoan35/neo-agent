import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const embeddings = sqliteTable('embeddings', {
  id: text('id').primaryKey(),
  sourceType: text('source_type').notNull(), // EmbeddingSource
  sourceId: text('source_id').notNull(),
  textContent: text('text_content').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
