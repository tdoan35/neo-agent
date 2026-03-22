import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { EmbeddingRecord, EmbeddingSource } from '@neo-agent/shared';
import { embeddings } from '../schema/embeddings.js';

function toEmbeddingRecord(row: typeof embeddings.$inferSelect): EmbeddingRecord {
  return {
    id: row.id,
    sourceType: row.sourceType as EmbeddingSource,
    sourceId: row.sourceId,
    textContent: row.textContent,
    createdAt: row.createdAt,
  };
}

export function createEmbedding(db: DrizzleDB, input: {
  sourceType: EmbeddingSource;
  sourceId: string;
  textContent: string;
}): EmbeddingRecord {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    textContent: input.textContent,
    createdAt: now,
  };
  db.insert(embeddings).values(row).run();
  return toEmbeddingRecord(row);
}

export function getEmbedding(db: DrizzleDB, id: string): EmbeddingRecord | null {
  const row = db.select().from(embeddings).where(eq(embeddings.id, id)).get();
  return row ? toEmbeddingRecord(row) : null;
}

export function deleteBySource(db: DrizzleDB, sourceType: EmbeddingSource, sourceId: string): void {
  db.delete(embeddings)
    .where(and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId)))
    .run();
}

export function listEmbeddings(db: DrizzleDB, sourceType?: EmbeddingSource): EmbeddingRecord[] {
  const query = sourceType
    ? db.select().from(embeddings).where(eq(embeddings.sourceType, sourceType))
    : db.select().from(embeddings);
  return query.all().map(toEmbeddingRecord);
}
