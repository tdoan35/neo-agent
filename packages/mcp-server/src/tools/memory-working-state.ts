import { z } from 'zod/v4';
import type { DrizzleDB } from '@neo-agent/memory';
import {
  createTask, getBoard, formatForInjection,
  transitionTask, addDecision, addOpenQuestion, updateTask,
} from '@neo-agent/memory';
import type { TaskState } from '@neo-agent/shared';

export const memoryWorkingStateSchema = {
  action: z.enum(['get', 'create', 'transition', 'update']).describe('Action to perform'),
  title: z.string().optional().describe('Task title (for create)'),
  taskId: z.string().optional().describe('Task ID (for transition/update)'),
  toState: z.enum(['backlog', 'active', 'blocked', 'done']).optional().describe('Target state (for transition)'),
  blockers: z.string().optional().describe('Blocker reason (required when transitioning to blocked)'),
  decision: z.string().optional().describe('Decision to record (for update)'),
  openQuestion: z.string().optional().describe('Open question to add (for update)'),
  context: z.string().optional().describe('Context JSON string (for update)'),
  handoffSummary: z.string().optional().describe('Handoff summary (for update)'),
};

export function createWorkingStateHandler(db: DrizzleDB, agentId: string, projectId?: string) {
  return async (args: {
    action: string;
    title?: string;
    taskId?: string;
    toState?: string;
    blockers?: string;
    decision?: string;
    openQuestion?: string;
    context?: string;
    handoffSummary?: string;
  }) => {
    try {
      switch (args.action) {
        case 'get': {
          const board = getBoard(db, agentId, projectId);
          const formatted = formatForInjection(board);
          return { content: [{ type: 'text' as const, text: formatted || 'No tasks in working memory.' }] };
        }

        case 'create': {
          if (!args.title) {
            return { content: [{ type: 'text' as const, text: 'Error: title is required for create action' }], isError: true };
          }
          const task = createTask(db, { agentId, title: args.title, projectId });
          return { content: [{ type: 'text' as const, text: `Created task "${task.title}" (id: ${task.id}, state: backlog)` }] };
        }

        case 'transition': {
          if (!args.taskId || !args.toState) {
            return { content: [{ type: 'text' as const, text: 'Error: taskId and toState are required for transition' }], isError: true };
          }
          const task = transitionTask(db, args.taskId, args.toState as TaskState, {
            blockers: args.blockers,
          });
          return { content: [{ type: 'text' as const, text: `Task "${task.title}" transitioned to ${task.state}` }] };
        }

        case 'update': {
          if (!args.taskId) {
            return { content: [{ type: 'text' as const, text: 'Error: taskId is required for update' }], isError: true };
          }
          const updates: string[] = [];

          if (args.decision) {
            addDecision(db, args.taskId, { content: args.decision, timestamp: new Date().toISOString() });
            updates.push(`decision: "${args.decision}"`);
          }
          if (args.openQuestion) {
            addOpenQuestion(db, args.taskId, args.openQuestion);
            updates.push(`question: "${args.openQuestion}"`);
          }
          if (args.context) {
            updateTask(db, args.taskId, { context: JSON.parse(args.context) });
            updates.push('context updated');
          }
          if (args.handoffSummary) {
            updateTask(db, args.taskId, { handoffSummary: args.handoffSummary });
            updates.push('handoff summary set');
          }

          return { content: [{ type: 'text' as const, text: `Task updated: ${updates.join(', ')}` }] };
        }

        default:
          return { content: [{ type: 'text' as const, text: `Unknown action: ${args.action}` }], isError: true };
      }
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  };
}
