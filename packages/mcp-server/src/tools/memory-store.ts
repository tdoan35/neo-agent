import { z } from 'zod/v4';
import type { DrizzleDB } from '@neo-agent/memory';
import type { EmbeddingProvider } from '@neo-agent/memory';
import { createFact, findEntityByAlias, createEntity, storeEmbedding } from '@neo-agent/memory';
import type { FactType, EntityType } from '@neo-agent/shared';

export const memoryStoreSchema = {
  content: z.string().describe('The fact, decision, or observation to store'),
  type: z.enum([
    'preference', 'decision', 'convention', 'status',
    'capability', 'biographical', 'environmental',
    'observation', 'lesson_learned', 'goal', 'blocker',
  ]).describe('Type of knowledge being stored'),
  entityName: z.string().optional().describe('Entity this fact relates to (will find-or-create)'),
  entityType: z.enum([
    'person', 'project', 'tool', 'service', 'concept',
    'codebase', 'organization', 'device', 'account',
    'language', 'framework',
  ]).optional().describe('Type of entity (required if entityName is new)'),
  scope: z.enum(['private', 'team', 'global']).optional().default('global'),
  confidence: z.number().min(0).max(1).optional().default(1.0),
};

export function createStoreHandler(db: DrizzleDB, provider: EmbeddingProvider, agentId: string, projectId?: string) {
  return async (args: {
    content: string;
    type: string;
    entityName?: string;
    entityType?: string;
    scope?: string;
    confidence?: number;
  }) => {
    try {
      let entityId: string | undefined;

      if (args.entityName) {
        const existing = findEntityByAlias(db, args.entityName);
        if (existing) {
          entityId = existing.id;
        } else {
          const entity = createEntity(db, {
            type: (args.entityType ?? 'concept') as EntityType,
            name: args.entityName,
            scope: (args.scope ?? 'global') as any,
          });
          entityId = entity.id;
        }
      }

      const fact = createFact(db, {
        type: args.type as FactType,
        content: args.content,
        entityId,
        scope: (args.scope ?? 'global') as any,
        sourceType: 'stated',
        confidence: args.confidence ?? 1.0,
        projectId: projectId,
        ownerAgent: agentId,
      });

      // Generate and store embedding
      const vec = await provider.embed(args.content);
      storeEmbedding(db, {
        sourceType: 'fact',
        sourceId: fact.id,
        textContent: args.content,
        vector: vec,
      });

      const entityInfo = entityId ? ` linked to entity "${args.entityName}"` : '';
      return {
        content: [{
          type: 'text' as const,
          text: `Stored fact (id: ${fact.id}): "${args.content}"${entityInfo} (${args.scope ?? 'global'} scope, confidence: ${args.confidence ?? 1.0})`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error storing fact: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  };
}
