import type { DrizzleDB } from '../../db.js';
import { updateBatchRunStats } from '../../store/batch-runs.js';
import { markAsProcessed } from '../../store/session-logs.js';

export interface PipelineStats {
  sessionsProcessed: number;
  factsCreated: number;
  factsUpdated: number;
  factsArchived: number;
  entitiesCreated: number;
  skillsCreated: number;
}

export function recordCompletion(
  db: DrizzleDB,
  batchRunId: string,
  logIds: string[],
  stats: PipelineStats,
): void {
  // Mark all processed logs
  if (logIds.length > 0) {
    markAsProcessed(db, logIds, batchRunId);
  }

  // Update batch run with final stats
  updateBatchRunStats(db, batchRunId, {
    ...stats,
    status: 'completed',
  });
}

export function recordFailure(
  db: DrizzleDB,
  batchRunId: string,
  error: string,
): void {
  updateBatchRunStats(db, batchRunId, {
    status: 'failed',
    error,
  });
}
