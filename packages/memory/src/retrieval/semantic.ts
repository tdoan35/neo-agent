import type { DrizzleDB } from '../db.js';
import type { EmbeddingProvider } from '../embeddings/generator.js';
import type { EmbeddingSource, AccessScope } from '@neo-agent/shared';
import { searchSimilar } from '../embeddings/index.js';
import { getFact, touchFact } from '../store/facts.js';
import { getEntity } from '../store/entities.js';
import { getSkill } from '../store/skills.js';
import { filterByScope, type ScopeFilter } from './scoped.js';

export interface SemanticResult {
  id: string;
  sourceType: EmbeddingSource;
  sourceId: string;
  content: string;
  similarity: number;
  confidence: number;
  recencyDays: number;
  score: number;
}

export async function semanticSearch(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  query: string,
  options?: {
    limit?: number;
    finalLimit?: number;
    sourceTypes?: EmbeddingSource[];
    scope?: ScopeFilter;
  },
): Promise<SemanticResult[]> {
  const limit = options?.limit ?? 20;
  const finalLimit = options?.finalLimit ?? 10;

  // Embed the query
  const queryVector = await provider.embed(query);

  // Search sqlite-vec
  const rawResults = searchSimilar(db, queryVector, {
    limit,
    sourceTypes: options?.sourceTypes,
  });

  if (rawResults.length === 0) return [];

  const now = new Date();
  const results: SemanticResult[] = [];

  for (const raw of rawResults) {
    const similarity = 1 - raw.distance; // sqlite-vec distance → similarity
    if (similarity <= 0) continue;

    // Look up source record to get confidence and timestamps
    let confidence = 1.0;
    let lastActivityDate: Date = now;
    let scope: AccessScope = 'global';
    let projectId: string | null = null;
    let ownerAgent: string | null = null;

    try {
      if (raw.sourceType === 'fact') {
        const fact = getFact(db, raw.sourceId);
        confidence = fact.confidence;
        lastActivityDate = new Date(fact.lastAccessedAt ?? fact.lastConfirmedAt ?? fact.createdAt);
        scope = fact.scope;
        projectId = fact.projectId;
        ownerAgent = fact.ownerAgent;
      } else if (raw.sourceType === 'entity') {
        const entity = getEntity(db, raw.sourceId);
        confidence = entity.confidence;
        lastActivityDate = new Date(entity.lastAccessedAt ?? entity.createdAt);
        scope = entity.scope;
        projectId = entity.projectId;
        ownerAgent = entity.ownerAgent;
      } else if (raw.sourceType === 'skill') {
        const skill = getSkill(db, raw.sourceId);
        confidence = skill.confidence;
        lastActivityDate = new Date(skill.lastUsedAt ?? skill.createdAt);
        scope = skill.scope;
        projectId = skill.projectId;
        ownerAgent = null;
      }
    } catch {
      continue; // Source record deleted, skip
    }

    // Scope filtering
    if (options?.scope) {
      const passes = filterByScope([{ scope, projectId, ownerAgent }], options.scope);
      if (passes.length === 0) continue;
    }

    const daysSinceActivity = Math.max(0, (now.getTime() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));
    const recencyFactor = 1 / (1 + Math.log(1 + daysSinceActivity));
    const score = similarity * confidence * recencyFactor;

    results.push({
      id: raw.id,
      sourceType: raw.sourceType,
      sourceId: raw.sourceId,
      content: raw.textContent,
      similarity,
      confidence,
      recencyDays: daysSinceActivity,
      score,
    });
  }

  // Sort by composite score (descending) and take top finalLimit
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, finalLimit);
}
