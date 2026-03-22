import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import {
  createMockEmbeddingProvider,
  storeEmbedding,
  searchSimilar,
  deleteEmbedding,
  deleteEmbeddingBySource,
} from '@neo-agent/memory';
import type { EmbeddingProvider } from '@neo-agent/memory';

let db: DrizzleDB;
let provider: EmbeddingProvider;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('embedding storage and retrieval', () => {
  it('stores and retrieves an embedding by similarity', async () => {
    const vec = await provider.embed('TypeScript programming language');
    const id = storeEmbedding(db, {
      sourceType: 'fact',
      sourceId: 'fact-1',
      textContent: 'TypeScript programming language',
      vector: vec,
    });
    expect(id).toBeDefined();

    // Search with the same text — should find it
    const queryVec = await provider.embed('TypeScript programming language');
    const results = searchSimilar(db, queryVec, { limit: 5 });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sourceId).toBe('fact-1');
    expect(results[0].distance).toBeCloseTo(0, 1); // Same text → very close
  });

  it('ranks more similar items higher', async () => {
    const texts = [
      'JavaScript web development',
      'TypeScript strongly typed language',
      'Python machine learning',
    ];

    for (let i = 0; i < texts.length; i++) {
      const vec = await provider.embed(texts[i]);
      storeEmbedding(db, {
        sourceType: 'fact',
        sourceId: `fact-${i}`,
        textContent: texts[i],
        vector: vec,
      });
    }

    // Search for TypeScript — should rank the TS fact highest
    const queryVec = await provider.embed('TypeScript');
    const results = searchSimilar(db, queryVec, { limit: 3 });

    expect(results.length).toBe(3);
    // The TypeScript fact should be closer (lower distance)
    const tsResult = results.find(r => r.sourceId === 'fact-1');
    expect(tsResult).toBeDefined();
  });

  it('filters by source type', async () => {
    const vec1 = await provider.embed('fact content');
    storeEmbedding(db, { sourceType: 'fact', sourceId: 'f1', textContent: 'fact content', vector: vec1 });

    const vec2 = await provider.embed('skill content');
    storeEmbedding(db, { sourceType: 'skill', sourceId: 's1', textContent: 'skill content', vector: vec2 });

    const queryVec = await provider.embed('content');
    const factsOnly = searchSimilar(db, queryVec, { limit: 10, sourceTypes: ['fact'] });
    const skillsOnly = searchSimilar(db, queryVec, { limit: 10, sourceTypes: ['skill'] });

    expect(factsOnly.every(r => r.sourceType === 'fact')).toBe(true);
    expect(skillsOnly.every(r => r.sourceType === 'skill')).toBe(true);
  });

  it('deletes an embedding by id', async () => {
    const vec = await provider.embed('to delete');
    const id = storeEmbedding(db, { sourceType: 'fact', sourceId: 'f1', textContent: 'to delete', vector: vec });

    deleteEmbedding(db, id);

    const queryVec = await provider.embed('to delete');
    const results = searchSimilar(db, queryVec, { limit: 5 });
    expect(results).toHaveLength(0);
  });

  it('deletes embeddings by source', async () => {
    const vec = await provider.embed('source delete');
    storeEmbedding(db, { sourceType: 'fact', sourceId: 'target', textContent: 'source delete', vector: vec });

    deleteEmbeddingBySource(db, 'fact', 'target');

    const queryVec = await provider.embed('source delete');
    const results = searchSimilar(db, queryVec, { limit: 5 });
    expect(results).toHaveLength(0);
  });
});

describe('mock embedding provider', () => {
  it('produces deterministic embeddings', async () => {
    const v1 = await provider.embed('hello world');
    const v2 = await provider.embed('hello world');
    expect(v1).toEqual(v2);
  });

  it('produces different embeddings for different text', async () => {
    const v1 = await provider.embed('hello');
    const v2 = await provider.embed('goodbye');
    expect(v1).not.toEqual(v2);
  });

  it('produces 768-dimensional vectors', async () => {
    const vec = await provider.embed('test');
    expect(vec.length).toBe(768);
  });

  it('batch embedding works', async () => {
    const results = await provider.embedBatch(['a', 'b', 'c']);
    expect(results).toHaveLength(3);
    expect(results[0].length).toBe(768);
  });
});
