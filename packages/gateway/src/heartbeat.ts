import type { DrizzleDB } from '@neo-agent/memory';
import type { KanbanBoard } from '@neo-agent/shared';
import { getBoard } from '@neo-agent/memory';

export interface HeartbeatConfig {
  intervalMs: number; // default: 600000 (10 minutes)
  onRefresh: (board: KanbanBoard) => void;
}

export interface Heartbeat {
  stop(): void;
  /** Manually trigger a heartbeat tick */
  tick(): void;
}

export function startHeartbeat(
  db: DrizzleDB,
  agentId: string,
  config: HeartbeatConfig,
  projectId?: string,
): Heartbeat {
  const tick = () => {
    const board = getBoard(db, agentId, projectId);
    config.onRefresh(board);
  };

  const timer = setInterval(tick, config.intervalMs);

  return {
    stop() {
      clearInterval(timer);
    },
    tick,
  };
}
