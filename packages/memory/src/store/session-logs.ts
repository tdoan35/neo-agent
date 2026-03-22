import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { SessionLogEntry, TurnRole, Surface } from '@neo-agent/shared';
import { sessionLogs } from '../schema/session-logs.js';

export interface CreateSessionLogInput {
  sessionId: string;
  agentId: string;
  projectId?: string;
  surface?: Surface;
  turnIndex: number;
  role: TurnRole;
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  model?: string;
  tokenCount?: number;
}

function toSessionLogEntry(row: typeof sessionLogs.$inferSelect): SessionLogEntry {
  return {
    id: row.id,
    sessionId: row.sessionId,
    agentId: row.agentId,
    projectId: row.projectId,
    surface: row.surface as Surface | null,
    turnIndex: row.turnIndex,
    role: row.role as TurnRole,
    content: row.content,
    toolName: row.toolName,
    toolInput: row.toolInput ? JSON.parse(row.toolInput) as Record<string, unknown> : null,
    model: row.model,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
    processed: row.processed,
    processedAt: row.processedAt,
    batchRunId: row.batchRunId,
  };
}

export function appendLog(db: DrizzleDB, input: CreateSessionLogInput): SessionLogEntry {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    sessionId: input.sessionId,
    agentId: input.agentId,
    projectId: input.projectId ?? null,
    surface: input.surface ?? null,
    turnIndex: input.turnIndex,
    role: input.role,
    content: input.content,
    toolName: input.toolName ?? null,
    toolInput: input.toolInput ? JSON.stringify(input.toolInput) : null,
    model: input.model ?? null,
    tokenCount: input.tokenCount ?? null,
    createdAt: now,
    processed: false,
    processedAt: null,
    batchRunId: null,
  };
  db.insert(sessionLogs).values(row).run();
  return toSessionLogEntry(row);
}

export function getSessionLogs(db: DrizzleDB, sessionId: string): SessionLogEntry[] {
  return db.select().from(sessionLogs)
    .where(eq(sessionLogs.sessionId, sessionId))
    .all()
    .map(toSessionLogEntry);
}

export function fullTextSearch(db: DrizzleDB, query: string, options?: { limit?: number }): SessionLogEntry[] {
  const limit = options?.limit ?? 10;
  const rows = db.$client.prepare(`
    SELECT sl.* FROM session_logs_fts fts
    JOIN session_logs sl ON sl.rowid = fts.rowid
    WHERE session_logs_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(query, limit) as Array<Record<string, unknown>>;

  return rows.map(row => ({
    id: row.id as string,
    sessionId: row.session_id as string,
    agentId: row.agent_id as string,
    projectId: row.project_id as string | null,
    surface: row.surface as Surface | null,
    turnIndex: row.turn_index as number,
    role: row.role as TurnRole,
    content: row.content as string,
    toolName: row.tool_name as string | null,
    toolInput: row.tool_input ? JSON.parse(row.tool_input as string) as Record<string, unknown> : null,
    model: row.model as string | null,
    tokenCount: row.token_count as number | null,
    createdAt: row.created_at as string,
    processed: Boolean(row.processed),
    processedAt: row.processed_at as string | null,
    batchRunId: row.batch_run_id as string | null,
  }));
}

export function getUnprocessedLogs(db: DrizzleDB): SessionLogEntry[] {
  return db.select().from(sessionLogs)
    .where(eq(sessionLogs.processed, false))
    .all()
    .map(toSessionLogEntry);
}

export function markAsProcessed(db: DrizzleDB, logIds: string[], batchRunId: string): void {
  const now = new Date().toISOString();
  for (const id of logIds) {
    db.update(sessionLogs)
      .set({ processed: true, processedAt: now, batchRunId })
      .where(eq(sessionLogs.id, id))
      .run();
  }
}
