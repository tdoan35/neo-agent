import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB, appendLog, replayEpisodes } from '@neo-agent/memory';

let db: DrizzleDB;

beforeEach(() => {
  db = createDatabase(':memory:');
});

describe('replayEpisodes', () => {
  it('returns empty when no unprocessed logs', () => {
    const result = replayEpisodes(db);
    expect(result.sessions).toHaveLength(0);
    expect(result.logIds).toHaveLength(0);
  });

  it('groups logs by session', () => {
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 0, role: 'user', content: 'Hello' });
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 1, role: 'assistant', content: 'Hi' });
    appendLog(db, { sessionId: 's2', agentId: 'a1', turnIndex: 0, role: 'user', content: 'Bye' });

    const result = replayEpisodes(db);
    expect(result.sessions).toHaveLength(2);
    expect(result.logIds).toHaveLength(3);
  });

  it('orders turns by index within each session', () => {
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 2, role: 'assistant', content: 'Third' });
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 0, role: 'user', content: 'First' });
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 1, role: 'tool', content: 'Second', toolName: 'Read' });

    const result = replayEpisodes(db);
    expect(result.sessions[0].turns[0].content).toBe('First');
    expect(result.sessions[0].turns[1].content).toBe('Second');
    expect(result.sessions[0].turns[2].content).toBe('Third');
  });

  it('extracts tool usage', () => {
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 0, role: 'tool', content: 'result', toolName: 'Read' });
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 1, role: 'tool', content: 'result', toolName: 'Edit' });
    appendLog(db, { sessionId: 's1', agentId: 'a1', turnIndex: 2, role: 'tool', content: 'result', toolName: 'Read' });

    const result = replayEpisodes(db);
    expect(result.sessions[0].toolsUsed).toContain('Read');
    expect(result.sessions[0].toolsUsed).toContain('Edit');
    expect(result.sessions[0].toolsUsed).toHaveLength(2); // Deduplicated
  });
});
