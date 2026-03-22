import type { DrizzleDB } from '../db.js';
import type { WorkingMemoryTask, TaskState, KanbanBoard } from '@neo-agent/shared';
import { InvalidStateTransitionError, MemoryError, VALID_TASK_TRANSITIONS } from '@neo-agent/shared';
import { getTask, updateTask, listTasks } from '../store/working-memory.js';
import { workingMemory } from '../schema/working-memory.js';
import { eq } from 'drizzle-orm';

export interface TransitionMetadata {
  blockers?: string;
  completionNotes?: string;
}

export function transitionTask(
  db: DrizzleDB,
  taskId: string,
  toState: TaskState,
  metadata?: TransitionMetadata,
): WorkingMemoryTask {
  const task = getTask(db, taskId);
  const validTargets = VALID_TASK_TRANSITIONS[task.state];

  if (!validTargets.includes(toState)) {
    throw new InvalidStateTransitionError(task.state, toState);
  }

  if (toState === 'blocked' && !metadata?.blockers) {
    throw new MemoryError('Transitioning to blocked requires a blockers reason', 'MISSING_BLOCKERS');
  }

  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = {
    state: toState,
    updatedAt: now,
  };

  if (toState === 'blocked') {
    setValues.blockers = metadata!.blockers;
  }

  if (toState === 'active' && task.state === 'blocked') {
    setValues.blockers = null;
  }

  if (toState === 'done') {
    setValues.completedAt = now;
  }

  db.update(workingMemory).set(setValues).where(eq(workingMemory.id, taskId)).run();
  return getTask(db, taskId);
}

export function getBoard(db: DrizzleDB, agentId: string, projectId?: string): KanbanBoard {
  const tasks = listTasks(db, { agentId, projectId });
  return {
    active: tasks.filter(t => t.state === 'active'),
    blocked: tasks.filter(t => t.state === 'blocked'),
    backlog: tasks.filter(t => t.state === 'backlog'),
    done: tasks.filter(t => t.state === 'done'),
  };
}

export function formatForInjection(board: KanbanBoard, tokenBudget: number = 500): string {
  const lines: string[] = ['## Working Memory', ''];
  let estimatedTokens = 5; // header

  // Active tasks (highest priority)
  if (board.active.length > 0) {
    lines.push('### Active');
    for (const task of board.active) {
      const taskLine = `- **${task.title}**`;
      const taskTokens = Math.ceil(taskLine.length / 4);
      if (estimatedTokens + taskTokens > tokenBudget) break;
      lines.push(taskLine);
      estimatedTokens += taskTokens;

      if (task.context) {
        const ctx = `  Context: ${JSON.stringify(task.context)}`;
        const ctxTokens = Math.ceil(ctx.length / 4);
        if (estimatedTokens + ctxTokens <= tokenBudget) {
          lines.push(ctx);
          estimatedTokens += ctxTokens;
        }
      }

      if (task.decisions.length > 0) {
        const dec = `  Decisions: [${task.decisions.length}] ${task.decisions[task.decisions.length - 1].content}`;
        const decTokens = Math.ceil(dec.length / 4);
        if (estimatedTokens + decTokens <= tokenBudget) {
          lines.push(dec);
          estimatedTokens += decTokens;
        }
      }

      if (task.openQuestions.length > 0) {
        const oq = `  Open questions: ${task.openQuestions[0]}`;
        const oqTokens = Math.ceil(oq.length / 4);
        if (estimatedTokens + oqTokens <= tokenBudget) {
          lines.push(oq);
          estimatedTokens += oqTokens;
        }
      }
    }
    lines.push('');
  }

  // Blocked tasks
  if (board.blocked.length > 0) {
    lines.push('### Blocked');
    for (const task of board.blocked) {
      const taskLine = `- **${task.title}**`;
      const blockerLine = task.blockers ? `  Blocker: ${task.blockers}` : '';
      const totalTokens = Math.ceil((taskLine.length + blockerLine.length) / 4);
      if (estimatedTokens + totalTokens > tokenBudget) break;
      lines.push(taskLine);
      if (blockerLine) lines.push(blockerLine);
      estimatedTokens += totalTokens;
    }
    lines.push('');
  }

  // Backlog (top 3 only)
  if (board.backlog.length > 0) {
    lines.push('### Backlog');
    for (const task of board.backlog.slice(0, 3)) {
      const taskLine = `- ${task.title}`;
      const taskTokens = Math.ceil(taskLine.length / 4);
      if (estimatedTokens + taskTokens > tokenBudget) break;
      lines.push(taskLine);
      estimatedTokens += taskTokens;
    }
    if (board.backlog.length > 3) {
      lines.push(`- ... and ${board.backlog.length - 3} more`);
    }
  }

  return lines.join('\n').trim();
}

export function addDecision(
  db: DrizzleDB,
  taskId: string,
  decision: { content: string; timestamp: string },
): WorkingMemoryTask {
  const task = getTask(db, taskId);
  const decisions = [...task.decisions, decision];
  const now = new Date().toISOString();

  db.update(workingMemory)
    .set({ decisions: JSON.stringify(decisions), updatedAt: now })
    .where(eq(workingMemory.id, taskId))
    .run();

  return getTask(db, taskId);
}

export function addOpenQuestion(db: DrizzleDB, taskId: string, question: string): WorkingMemoryTask {
  const task = getTask(db, taskId);
  const questions = [...task.openQuestions, question];
  const now = new Date().toISOString();

  db.update(workingMemory)
    .set({ openQuestions: JSON.stringify(questions), updatedAt: now })
    .where(eq(workingMemory.id, taskId))
    .run();

  return getTask(db, taskId);
}

export function resolveOpenQuestion(db: DrizzleDB, taskId: string, questionIndex: number): WorkingMemoryTask {
  const task = getTask(db, taskId);
  const questions = task.openQuestions.filter((_, i) => i !== questionIndex);
  const now = new Date().toISOString();

  db.update(workingMemory)
    .set({ openQuestions: JSON.stringify(questions), updatedAt: now })
    .where(eq(workingMemory.id, taskId))
    .run();

  return getTask(db, taskId);
}
