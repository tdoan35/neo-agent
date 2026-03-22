import type { DrizzleDB } from '@neo-agent/memory';
import { getBoard } from '@neo-agent/memory';

export interface PreCompactHookInput {
  hook_event_name: 'PreCompact';
  session_id: string;
  agent_id?: string;
  trigger: 'manual' | 'auto';
  custom_instructions: string | null;
  cwd: string;
  transcript_path: string;
  permission_mode?: string;
}

export function createPreCompactHook(
  db: DrizzleDB,
  agentId: string,
  projectId?: string,
) {
  return async (input: PreCompactHookInput) => {
    // Ensure all working memory state is persisted to DB
    // getBoard reads from DB, so tasks are already persisted via store operations.
    // This hook serves as a checkpoint — verify board is accessible before compaction.
    const board = getBoard(db, input.agent_id ?? agentId, projectId);

    const taskCount =
      board.active.length +
      board.blocked.length +
      board.backlog.length +
      board.done.length;

    return {
      continue: true,
      systemMessage: taskCount > 0
        ? `Pre-compact checkpoint: ${taskCount} task(s) persisted to working memory.`
        : undefined,
    };
  };
}
