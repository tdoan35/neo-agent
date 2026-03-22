import { z } from 'zod/v4';
import type { DrizzleDB } from '@neo-agent/memory';
import { getUnprocessedLogs, getLatestBatchRun } from '@neo-agent/memory';

// Empty schema — no parameters needed
export const memoryDreamSchema = {};

export function createDreamHandler(db: DrizzleDB) {
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

      // TODO: Wire actual pipeline runner in Phase 4
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
