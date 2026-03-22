import type { DrizzleDB } from '../../db.js';
import type { EmbeddingProvider } from '../../embeddings/generator.js';
import type { Fact, Entity, Relation } from '@neo-agent/shared';
import { createFact, listFacts, supersedeFact } from '../../store/facts.js';
import { createEntity, findEntityByAlias, updateEntity } from '../../store/entities.js';
import { createRelation } from '../../store/relations.js';
import { storeEmbedding, searchSimilar } from '../../embeddings/index.js';
import { buildEntityResolutionPrompt, buildContradictionPrompt } from '../prompts/entity-resolution.js';
import type { ClassifiedItem } from './02-para-classify.js';
import type { LlmCall } from '../runner.js';

export interface IntegrationResult {
  factsCreated: Fact[];
  factsUpdated: Fact[];
  entitiesCreated: Entity[];
  entitiesLinked: number;
  contradictions: Array<{ oldFact: Fact; newFact: Fact }>;
  relationsCreated: Relation[];
}

async function resolveEntity(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  llmCall: LlmCall,
  name: string,
  type: string | undefined,
  context: string,
): Promise<{ entity: Entity; isNew: boolean }> {
  // 1. Check exact alias match
  const existing = findEntityByAlias(db, name);
  if (existing) return { entity: existing, isNew: false };

  // 2. Semantic similarity check
  try {
    const nameVec = await provider.embed(name);
    const similar = searchSimilar(db, nameVec, { limit: 3, sourceTypes: ['entity'] });

    for (const match of similar) {
      const similarity = 1 - match.distance;
      if (similarity > 0.90) {
        // High confidence — same entity
        const matchEntity = findEntityByAlias(db, match.textContent);
        if (matchEntity) {
          // Add as alias
          const aliases = matchEntity.aliases ?? [];
          if (!aliases.includes(name)) {
            updateEntity(db, matchEntity.id, { aliases: [...aliases, name] });
          }
          return { entity: matchEntity, isNew: false };
        }
      } else if (similarity > 0.75) {
        // Ambiguous — ask LLM
        const matchEntity = findEntityByAlias(db, match.textContent);
        if (matchEntity) {
          try {
            const answer = await llmCall(buildEntityResolutionPrompt(name, matchEntity.name, matchEntity.type, context));
            if (answer.trim().toUpperCase().startsWith('YES')) {
              const aliases = matchEntity.aliases ?? [];
              if (!aliases.includes(name)) {
                updateEntity(db, matchEntity.id, { aliases: [...aliases, name] });
              }
              return { entity: matchEntity, isNew: false };
            }
          } catch {
            // LLM failure — treat as different entity
          }
        }
      }
    }
  } catch {
    // Embedding failure — fall through to create new entity
  }

  // 3. Create new entity
  const entity = createEntity(db, {
    type: (type as any) ?? 'concept',
    name,
    scope: 'private',
    confidence: 0.7,
  });

  // Store entity embedding
  try {
    const vec = await provider.embed(name);
    storeEmbedding(db, { sourceType: 'entity', sourceId: entity.id, textContent: name, vector: vec });
  } catch {
    // Non-critical
  }

  return { entity, isNew: true };
}

export async function integrateSemantics(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  llmCall: LlmCall,
  items: ClassifiedItem[],
): Promise<IntegrationResult> {
  const result: IntegrationResult = {
    factsCreated: [],
    factsUpdated: [],
    entitiesCreated: [],
    entitiesLinked: 0,
    contradictions: [],
    relationsCreated: [],
  };

  // Track entities seen in this batch for relation creation
  const entityPairs: Array<{ entity1: Entity; entity2: Entity; context: string }> = [];
  const entityByName = new Map<string, Entity>();

  for (const item of items) {
    // Resolve entity if specified
    let entityId: string | undefined;
    if (item.entityName) {
      const { entity, isNew } = await resolveEntity(
        db, provider, llmCall,
        item.entityName, item.entityType, item.content,
      );
      entityId = entity.id;
      if (isNew) {
        result.entitiesCreated.push(entity);
      } else {
        result.entitiesLinked++;
      }

      // Track for relation detection
      if (entityByName.size > 0) {
        for (const [, prevEntity] of entityByName) {
          if (prevEntity.id !== entity.id) {
            entityPairs.push({ entity1: prevEntity, entity2: entity, context: item.content });
          }
        }
      }
      entityByName.set(item.entityName, entity);
    }

    // Dedup check: embed the fact content and check for near-duplicates
    let isDuplicate = false;
    try {
      const factVec = await provider.embed(item.content);
      const similar = searchSimilar(db, factVec, { limit: 1, sourceTypes: ['fact'] });
      if (similar.length > 0 && (1 - similar[0].distance) > 0.95) {
        isDuplicate = true;
        // Boost confidence of existing fact
        result.factsUpdated.push(similar[0] as any);
      }
    } catch {
      // Skip dedup on embedding failure
    }

    if (isDuplicate) continue;

    // Contradiction check
    if (entityId) {
      const existingFacts = listFacts(db, { entityId, type: item.type });
      for (const existing of existingFacts) {
        try {
          const answer = await llmCall(buildContradictionPrompt(
            existing.content, existing.createdAt,
            item.content, new Date().toISOString(),
          ));
          const verdict = answer.trim().toUpperCase();
          if (verdict.startsWith('CONTRADICTS') || verdict.startsWith('UPDATES')) {
            const newFact = supersedeFact(db, existing.id, {
              type: item.type,
              content: item.content,
              entityId,
              containerId: item.containerId,
              scope: 'private',
              sourceType: 'extracted',
              extractedBy: 'dream-pipeline',
              confidence: item.confidence,
            });
            result.contradictions.push({ oldFact: existing, newFact });

            // Store embedding for new fact
            try {
              const vec = await provider.embed(newFact.content);
              storeEmbedding(db, { sourceType: 'fact', sourceId: newFact.id, textContent: newFact.content, vector: vec });
            } catch { /* non-critical */ }

            result.factsCreated.push(newFact);
            isDuplicate = true; // Don't create again
            break;
          }
        } catch {
          // LLM failure — treat as compatible
        }
      }
    }

    if (isDuplicate) continue;

    // Create fact
    const fact = createFact(db, {
      type: item.type,
      content: item.content,
      entityId,
      containerId: item.containerId,
      scope: 'private',
      sourceType: 'extracted',
      extractedBy: 'dream-pipeline',
      confidence: item.confidence,
    });

    // Store fact embedding
    try {
      const vec = await provider.embed(fact.content);
      storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });
    } catch { /* non-critical */ }

    result.factsCreated.push(fact);
  }

  // Create relations for entities mentioned together
  for (const pair of entityPairs.slice(0, 20)) { // Limit relations per batch
    try {
      const relation = createRelation(db, {
        sourceEntityId: pair.entity1.id,
        targetEntityId: pair.entity2.id,
        type: 'related_to',
        label: `Co-mentioned: ${pair.context.slice(0, 100)}`,
        scope: 'private',
        confidence: 0.6,
      });
      result.relationsCreated.push(relation);
    } catch { /* duplicate relation, etc */ }
  }

  return result;
}
