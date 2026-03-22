import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import { appendLog, getSessionLogs, fullTextSearch, getUnprocessedLogs, markAsProcessed } from '@neo-agent/memory';

let db: DrizzleDB;
beforeEach(() => { db = createDatabase(':memory:'); });

describe('session-logs store', () => {
  it('appends a log entry', () => {
    const entry = appendLog(db, {
      sessionId: 'sess-1', agentId: 'agent-1', turnIndex: 0,
      role: 'user', content: 'Hello world',
    });
    expect(entry.id).toBeDefined();
    expect(entry.sessionId).toBe('sess-1');
    expect(entry.processed).toBe(false);
  });

  it('gets logs by session', () => {
    appendLog(db, { sessionId: 'sess-1', agentId: 'a', turnIndex: 0, role: 'user', content: 'msg1' });
    appendLog(db, { sessionId: 'sess-1', agentId: 'a', turnIndex: 1, role: 'assistant', content: 'msg2' });
    appendLog(db, { sessionId: 'sess-2', agentId: 'a', turnIndex: 0, role: 'user', content: 'msg3' });

    expect(getSessionLogs(db, 'sess-1')).toHaveLength(2);
    expect(getSessionLogs(db, 'sess-2')).toHaveLength(1);
  });

  it('stores tool input as JSON', () => {
    const entry = appendLog(db, {
      sessionId: 'sess-1', agentId: 'a', turnIndex: 0,
      role: 'tool', content: 'result', toolName: 'Read',
      toolInput: { path: 'src/auth.ts' },
    });
    expect(entry.toolName).toBe('Read');
    expect(entry.toolInput).toEqual({ path: 'src/auth.ts' });
  });

  it('full-text search finds matching content', () => {
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'review the authentication module' });
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 1, role: 'assistant', content: 'I found a bug in the database layer' });

    const authResults = fullTextSearch(db, 'authentication');
    expect(authResults).toHaveLength(1);
    expect(authResults[0].content).toContain('authentication');

    const dbResults = fullTextSearch(db, 'database');
    expect(dbResults).toHaveLength(1);
  });

  it('full-text search respects limit', () => {
    for (let i = 0; i < 5; i++) {
      appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: i, role: 'user', content: `message about testing ${i}` });
    }
    expect(fullTextSearch(db, 'testing', { limit: 2 })).toHaveLength(2);
  });

  it('gets unprocessed logs', () => {
    const e1 = appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'msg1' });
    const e2 = appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 1, role: 'user', content: 'msg2' });

    expect(getUnprocessedLogs(db)).toHaveLength(2);

    markAsProcessed(db, [e1.id], 'batch-1');
    expect(getUnprocessedLogs(db)).toHaveLength(1);
  });

  it('markAsProcessed sets processed flag and batchRunId', () => {
    const e = appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'msg' });
    markAsProcessed(db, [e.id], 'batch-42');

    const logs = getSessionLogs(db, 's1');
    expect(logs[0].processed).toBe(true);
    expect(logs[0].batchRunId).toBe('batch-42');
    expect(logs[0].processedAt).toBeDefined();
  });
});
