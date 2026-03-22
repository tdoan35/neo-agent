import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const identities = sqliteTable('identities', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  role: text('role').notNull(),
  tone: text('tone').notNull(),
  avatar: text('avatar').notNull(), // JSON: { color: string, letter: string }
  persona: text('persona').notNull(),
  boundaries: text('boundaries').notNull().$defaultFn(() => '[]'), // JSON array
  soulPath: text('soul_path').notNull(),
  isPreset: integer('is_preset', { mode: 'boolean' }).notNull().$defaultFn(() => false),
  createdFrom: text('created_from'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
