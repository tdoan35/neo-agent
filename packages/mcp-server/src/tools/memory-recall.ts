import { z } from 'zod/v4';
import type { DrizzleDB } from '@neo-agent/memory';
import type { EmbeddingProvider } from '@neo-agent/memory';
import { assembleContext } from '@neo-agent/memory';

export const memoryRecallSchema = {
  query: z.string().describe('What to recall — the current topic, question, or situation'),
  scope: z.enum(['global', 'team', 'private']).optional().describe('Filter by access scope'),
  limit: z.number().optional().default(10).describe('Max number of results'),
};

export function createRecallHandler(db: DrizzleDB, provider: EmbeddingProvider, agentId: string, projectId?: string) {
  return async (args: { query: string; scope?: string; limit?: number }) => {
    try {
      const context = await assembleContext(db, provider, agentId, projectId ?? null, args.query, {
        mode: 'PerPrompt',
      });

      return {
        content: [{ type: 'text' as const, text: context || 'No relevant context found.' }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error recalling context: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  };
}
