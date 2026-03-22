import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import { createTask } from '@neo-agent/memory';
import { transitionTask, getBoard, formatForInjection, addDecision, addOpenQuestion, resolveOpenQuestion } from '@neo-agent/memory';
import { InvalidStateTransitionError, MemoryError } from '@neo-agent/shared';

let db: DrizzleDB;
beforeEach(() => { db = createDatabase(':memory:'); });

describe('working memory state machine', () => {
  describe('transitions', () => {
    it('backlog → active', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test task' });
      expect(task.state).toBe('backlog');
      const updated = transitionTask(db, task.id, 'active');
      expect(updated.state).toBe('active');
    });

    it('active → blocked (with blockers)', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test', state: 'active' });
      const blocked = transitionTask(db, task.id, 'blocked', { blockers: 'Waiting on API key' });
      expect(blocked.state).toBe('blocked');
      expect(blocked.blockers).toBe('Waiting on API key');
    });

    it('active → blocked (without blockers) throws', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test', state: 'active' });
      expect(() => transitionTask(db, task.id, 'blocked')).toThrow(MemoryError);
    });

    it('blocked → active (clears blockers)', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test', state: 'active' });
      transitionTask(db, task.id, 'blocked', { blockers: 'reason' });
      const unblocked = transitionTask(db, task.id, 'active');
      expect(unblocked.state).toBe('active');
      expect(unblocked.blockers).toBeNull();
    });

    it('active → done (sets completedAt)', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test', state: 'active' });
      const done = transitionTask(db, task.id, 'done');
      expect(done.state).toBe('done');
      expect(done.completedAt).toBeDefined();
    });

    it('backlog → blocked is invalid', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test' });
      expect(() => transitionTask(db, task.id, 'blocked', { blockers: 'x' }))
        .toThrow(InvalidStateTransitionError);
    });

    it('backlog → done is invalid', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test' });
      expect(() => transitionTask(db, task.id, 'done')).toThrow(InvalidStateTransitionError);
    });

    it('done → active is invalid', () => {
      const task = createTask(db, { agentId: 'a', title: 'Test', state: 'active' });
      transitionTask(db, task.id, 'done');
      expect(() => transitionTask(db, task.id, 'active')).toThrow(InvalidStateTransitionError);
    });
  });

  describe('getBoard', () => {
    it('groups tasks by state', () => {
      createTask(db, { agentId: 'a', title: 'Backlog 1' });
      createTask(db, { agentId: 'a', title: 'Backlog 2' });
      const active = createTask(db, { agentId: 'a', title: 'Active 1', state: 'active' });
      transitionTask(db, active.id, 'blocked', { blockers: 'waiting' });

      const board = getBoard(db, 'a');
      expect(board.backlog).toHaveLength(2);
      expect(board.blocked).toHaveLength(1);
      expect(board.active).toHaveLength(0);
      expect(board.done).toHaveLength(0);
    });

    it('filters by agentId', () => {
      createTask(db, { agentId: 'a', title: 'Agent A task' });
      createTask(db, { agentId: 'b', title: 'Agent B task' });

      expect(getBoard(db, 'a').backlog).toHaveLength(1);
      expect(getBoard(db, 'b').backlog).toHaveLength(1);
    });
  });

  describe('formatForInjection', () => {
    it('produces markdown with sections', () => {
      createTask(db, { agentId: 'a', title: 'Active task', state: 'active' });
      createTask(db, { agentId: 'a', title: 'Backlog task' });

      const board = getBoard(db, 'a');
      const output = formatForInjection(board);

      expect(output).toContain('## Working Memory');
      expect(output).toContain('### Active');
      expect(output).toContain('**Active task**');
      expect(output).toContain('### Backlog');
      expect(output).toContain('Backlog task');
    });

    it('shows blocked tasks with blockers', () => {
      const task = createTask(db, { agentId: 'a', title: 'Stuck task', state: 'active' });
      transitionTask(db, task.id, 'blocked', { blockers: 'Need API credentials' });

      const board = getBoard(db, 'a');
      const output = formatForInjection(board);

      expect(output).toContain('### Blocked');
      expect(output).toContain('**Stuck task**');
      expect(output).toContain('Blocker: Need API credentials');
    });

    it('limits backlog to 3 items', () => {
      for (let i = 0; i < 5; i++) {
        createTask(db, { agentId: 'a', title: `Backlog ${i}` });
      }

      const board = getBoard(db, 'a');
      const output = formatForInjection(board, 2000); // generous budget

      expect(output).toContain('Backlog 0');
      expect(output).toContain('Backlog 2');
      expect(output).not.toContain('Backlog 3');
      expect(output).toContain('and 2 more');
    });

    it('does not include done tasks', () => {
      const task = createTask(db, { agentId: 'a', title: 'Finished', state: 'active' });
      transitionTask(db, task.id, 'done');

      const board = getBoard(db, 'a');
      const output = formatForInjection(board);

      expect(output).not.toContain('Finished');
    });
  });

  describe('decisions and questions', () => {
    it('addDecision appends to decisions array', () => {
      const task = createTask(db, { agentId: 'a', title: 'Task' });
      const now = new Date().toISOString();
      const updated = addDecision(db, task.id, { content: 'Use JWT', timestamp: now });

      expect(updated.decisions).toHaveLength(1);
      expect(updated.decisions[0].content).toBe('Use JWT');

      const updated2 = addDecision(db, task.id, { content: 'Use RS256', timestamp: now });
      expect(updated2.decisions).toHaveLength(2);
    });

    it('addOpenQuestion appends to questions', () => {
      const task = createTask(db, { agentId: 'a', title: 'Task' });
      addOpenQuestion(db, task.id, 'Should we use refresh tokens?');
      const updated = addOpenQuestion(db, task.id, 'What about session tokens?');

      expect(updated.openQuestions).toHaveLength(2);
      expect(updated.openQuestions[0]).toBe('Should we use refresh tokens?');
    });

    it('resolveOpenQuestion removes by index', () => {
      const task = createTask(db, { agentId: 'a', title: 'Task' });
      addOpenQuestion(db, task.id, 'Q1');
      addOpenQuestion(db, task.id, 'Q2');
      addOpenQuestion(db, task.id, 'Q3');

      const updated = resolveOpenQuestion(db, task.id, 1); // remove Q2
      expect(updated.openQuestions).toEqual(['Q1', 'Q3']);
    });
  });
});
