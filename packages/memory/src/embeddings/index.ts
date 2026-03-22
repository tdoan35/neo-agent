import { randomUUID } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import type { DrizzleDB } from '../db.js';
import type { EmbeddingSource } from '@neo-agent/shared';
import { embeddings } from '../schema/embeddings.js';

export type { EmbeddingProvider } from './generator.js';
export { createOllamaEmbeddingProvider, createMockEmbeddingProvider } from './generator.js';

export interface SimilarityResult {
  id: string;
  sourceType: EmbeddingSource;
  sourceId: string;
  textContent: string;
  distance: number;
}

export function storeEmbedding(
  db: DrizzleDB,
  input: {
    sourceType: EmbeddingSource;
    sourceId: string;
    textContent: string;
    vector: Float32Array;
  },
): string {
  const id = randomUUID();
  const now = new Date().toISOString();

  // Insert metadata into embeddings table
  db.insert(embeddings).values({
    id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    textContent: input.textContent,
    createdAt: now,
  }).run();

  // Insert vector into vec_embeddings virtual table
  db.$client.prepare(
    'INSERT INTO vec_embeddings (id, vector) VALUES (?, ?)',
  ).run(id, Buffer.from(input.vector.buffer));

  return id;
}

export function searchSimilar(
  db: DrizzleDB,
  queryVector: Float32Array,
  options?: {
    limit?: number;
    sourceTypes?: EmbeddingSource[];
  },
): SimilarityResult[] {
  const limit = options?.limit ?? 10;
  const vecBuffer = Buffer.from(queryVector.buffer);

  let sql: string;
  let params: unknown[];

  if (options?.sourceTypes && options.sourceTypes.length > 0) {
    const placeholders = options.sourceTypes.map(() => '?').join(', ');
    sql = `
      SELECT v.id, v.distance, e.source_type, e.source_id, e.text_content
      FROM vec_embeddings v
      JOIN embeddings e ON e.id = v.id
      WHERE v.vector MATCH ? AND v.k = ?
        AND e.source_type IN (${placeholders})
      ORDER BY v.distance
    `;
    params = [vecBuffer, limit, ...options.sourceTypes];
  } else {
    sql = `
      SELECT v.id, v.distance, e.source_type, e.source_id, e.text_content
      FROM vec_embeddings v
      JOIN embeddings e ON e.id = v.id
      WHERE v.vector MATCH ? AND v.k = ?
      ORDER BY v.distance
    `;
    params = [vecBuffer, limit];
  }

  const rows = db.$client.prepare(sql).all(...params) as Array<{
    id: string;
    distance: number;
    source_type: string;
    source_id: string;
    text_content: string;
  }>;

  return rows.map(row => ({
    id: row.id,
    sourceType: row.source_type as EmbeddingSource,
    sourceId: row.source_id,
    textContent: row.text_content,
    distance: row.distance,
  }));
}

export function deleteEmbedding(db: DrizzleDB, id: string): void {
  db.delete(embeddings).where(eq(embeddings.id, id)).run();
  db.$client.prepare('DELETE FROM vec_embeddings WHERE id = ?').run(id);
}

export function deleteEmbeddingBySource(db: DrizzleDB, sourceType: EmbeddingSource, sourceId: string): void {
  // Find the embedding IDs first
  const rows = db.select().from(embeddings)
    .where(and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId)))
    .all();

  for (const row of rows) {
    db.$client.prepare('DELETE FROM vec_embeddings WHERE id = ?').run(row.id);
  }

  db.delete(embeddings)
    .where(and(eq(embeddings.sourceType, sourceType), eq(embeddings.sourceId, sourceId)))
    .run();
}
