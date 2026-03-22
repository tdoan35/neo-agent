import { z } from 'zod/v4';
import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { getUnprocessedLogs, getLatestBatchRun, runPipeline } from '@neo-agent/memory';
import type { LlmCall } from '@neo-agent/memory';

// Empty schema — no parameters needed
export const memoryDreamSchema = {};

export function createDreamHandler(db: DrizzleDB, embeddingProvider?: EmbeddingProvider, llmCall?: LlmCall) {
  return async (_args: Record<string, never>) => {
    try {
      // Check if a run is already in progress
      const latest = getLatestBatchRun(db);
      if (latest && latest.status === 'running') {
        return {
          content: [{
            type: 'text' as const,
            text: `Dream processing already in progress (batch: ${latest.id}, started: ${latest.startedAt})`,
          }],
        };
      }

      // Count unprocessed sessions
      const unprocessed = getUnprocessedLogs(db);
      const sessionIds = new Set(unprocessed.map(l => l.sessionId));

      if (sessionIds.size === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No unprocessed sessions to consolidate.',
          }],
        };
      }

      // If pipeline dependencies are available, run the actual pipeline
      if (embeddingProvider && llmCall) {
        const result = await runPipeline({
          db,
          embeddingProvider,
          llmCall,
          triggerType: 'manual',
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Dream processing complete. ${result.sessionsProcessed} session(s) processed: ${result.factsCreated} facts created, ${result.entitiesCreated} entities, ${result.skillsCreated} skills. Duration: ${result.duration}ms.`,
          }],
        };
      }

      // Fallback: report counts without running pipeline
      return {
        content: [{
          type: 'text' as const,
          text: `Dream processing triggered. ${sessionIds.size} session(s) with ${unprocessed.length} unprocessed log entries queued for consolidation.`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error triggering dream: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  };
}
