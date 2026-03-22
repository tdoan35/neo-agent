import { sqliteTable, text, real } from 'drizzle-orm/sqlite-core';

export const facts = sqliteTable('facts', {
  id: text('id').primaryKey(),
  entityId: text('entity_id'),
  containerId: text('container_id'),
  type: text('type').notNull(), // FactType
  content: text('content').notNull(),
  structured: text('structured'), // JSON object
  scope: text('scope').notNull().$defaultFn(() => 'global'),
  projectId: text('project_id'),
  ownerAgent: text('owner_agent'),
  sourceSessionId: text('source_session_id'),
  sourceType: text('source_type').notNull().$defaultFn(() => 'stated'), // SourceType
  extractedBy: text('extracted_by'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
  lastConfirmedAt: text('last_confirmed_at'),
  lastAccessedAt: text('last_accessed_at'),
  expiresAt: text('expires_at'),
  confidence: real('confidence').notNull().$defaultFn(() => 1.0),
  decayRate: real('decay_rate').notNull().$defaultFn(() => 0.02),
  supersedesFactId: text('supersedes_fact_id'),
});
