import { z } from 'zod/v4';
import type { DrizzleDB } from '@neo-agent/memory';
import type { EmbeddingProvider } from '@neo-agent/memory';
import { semanticSearch, keywordSearch } from '@neo-agent/memory';

export const memorySearchSchema = {
  query: z.string().describe('Search query'),
  mode: z.enum(['semantic', 'keyword', 'both']).optional().default('both'),
  limit: z.number().optional().default(10),
};

export function createSearchHandler(db: DrizzleDB, provider: EmbeddingProvider, agentId: string, projectId?: string) {
  return async (args: { query: string; mode?: string; limit?: number }) => {
    try {
      const limit = args.limit ?? 10;
      const lines: string[] = [];

      if (args.mode === 'semantic' || args.mode === 'both' || !args.mode) {
        const semanticResults = await semanticSearch(db, provider, args.query, {
          finalLimit: limit,
          scope: { agentId, projectId },
        });

        if (semanticResults.length > 0) {
          lines.push('## Semantic Results', '');
          for (const r of semanticResults) {
            lines.push(`- [${r.sourceType}] ${r.content} (score: ${r.score.toFixed(3)}, confidence: ${r.confidence.toFixed(2)})`);
          }
        }
      }

      if (args.mode === 'keyword' || args.mode === 'both') {
        const kwResults = keywordSearch(db, args.query, { limit });

        if (kwResults.length > 0) {
          if (lines.length > 0) lines.push('');
          lines.push('## Keyword Results', '');
          for (const r of kwResults) {
            lines.push(`- [session: ${r.sessionId}] ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}`);
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: lines.length > 0 ? lines.join('\n') : 'No results found.',
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error searching: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  };
}
