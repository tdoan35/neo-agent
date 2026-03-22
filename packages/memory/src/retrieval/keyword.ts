import type { DrizzleDB } from '../db.js';
import type { Surface, TurnRole } from '@neo-agent/shared';

export interface KeywordResult {
  sessionLogId: string;
  sessionId: string;
  content: string;
  rank: number;
  createdAt: string;
}

export function keywordSearch(
  db: DrizzleDB,
  query: string,
  options?: {
    limit?: number;
    sessionId?: string;
  },
): KeywordResult[] {
  const limit = options?.limit ?? 10;

  let sql: string;
  let params: unknown[];

  if (options?.sessionId) {
    sql = `
      SELECT sl.id, sl.session_id, sl.content, rank, sl.created_at
      FROM session_logs_fts fts
      JOIN session_logs sl ON sl.rowid = fts.rowid
      WHERE session_logs_fts MATCH ? AND sl.session_id = ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [query, options.sessionId, limit];
  } else {
    sql = `
      SELECT sl.id, sl.session_id, sl.content, rank, sl.created_at
      FROM session_logs_fts fts
      JOIN session_logs sl ON sl.rowid = fts.rowid
      WHERE session_logs_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;
    params = [query, limit];
  }

  const rows = db.$client.prepare(sql).all(...params) as Array<{
    id: string;
    session_id: string;
    content: string;
    rank: number;
    created_at: string;
  }>;

  return rows.map(row => ({
    sessionLogId: row.id,
    sessionId: row.session_id,
    content: row.content,
    rank: row.rank,
    createdAt: row.created_at,
  }));
}
