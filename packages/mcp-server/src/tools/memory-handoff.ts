import { z } from 'zod/v4';
import type { DrizzleDB } from '@neo-agent/memory';
import { listTasks, updateTask } from '@neo-agent/memory';

export const memoryHandoffSchema = {
  summary: z.string().describe('Human-readable summary of what was accomplished and what remains'),
};

export function createHandoffHandler(db: DrizzleDB, agentId: string, projectId?: string) {
  return async (args: { summary: string }) => {
    try {
      const activeTasks = listTasks(db, { agentId, state: 'active' });
      const blockedTasks = listTasks(db, { agentId, state: 'blocked' });
      const allTasks = [...activeTasks, ...blockedTasks];

      for (const task of allTasks) {
        updateTask(db, task.id, { handoffSummary: args.summary });
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Handoff summary saved to ${allTasks.length} active/blocked task(s). Summary: "${args.summary.slice(0, 100)}${args.summary.length > 100 ? '...' : ''}"`,
        }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error saving handoff: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  };
}
