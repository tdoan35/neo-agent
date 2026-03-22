import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createDatabase, type DrizzleDB, createTask } from '@neo-agent/memory';
import type { KanbanBoard } from '@neo-agent/shared';
import { startHeartbeat, type Heartbeat } from '../src/heartbeat.js';

let db: DrizzleDB;
let heartbeat: Heartbeat | null = null;

beforeEach(() => {
  db = createDatabase(':memory:');
});

afterEach(() => {
  heartbeat?.stop();
  heartbeat = null;
});

describe('Heartbeat', () => {
  it('calls onRefresh with current board on tick', () => {
    createTask(db, { agentId: 'agent-1', title: 'My task', state: 'active' });

    let receivedBoard: KanbanBoard | null = null;
    heartbeat = startHeartbeat(db, 'agent-1', {
      intervalMs: 100000, // Won't auto-fire in test
      onRefresh: (board) => { receivedBoard = board; },
    });

    // Manually trigger tick
    heartbeat.tick();

    expect(receivedBoard).not.toBeNull();
    expect(receivedBoard!.active).toHaveLength(1);
    expect(receivedBoard!.active[0].title).toBe('My task');
  });

  it('stop prevents further ticks', () => {
    let callCount = 0;
    heartbeat = startHeartbeat(db, 'agent-1', {
      intervalMs: 10,
      onRefresh: () => { callCount++; },
    });

    heartbeat.stop();
    heartbeat = null; // Prevent afterEach from double-stopping

    const current = callCount;
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(callCount).toBe(current); // No additional calls
        resolve();
      }, 50);
    });
  });
});
