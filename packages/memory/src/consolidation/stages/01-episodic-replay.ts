import type { DrizzleDB } from '../../db.js';
import type { TurnRole } from '@neo-agent/shared';
import { getUnprocessedLogs } from '../../store/session-logs.js';

export interface SessionTurn {
  turnIndex: number;
  role: TurnRole;
  content: string;
  toolName?: string;
  toolInput?: unknown;
}

export interface SessionSummary {
  sessionId: string;
  agentId: string;
  projectId: string | null;
  turns: SessionTurn[];
  toolsUsed: string[];
  startedAt: string;
  endedAt: string;
}

export interface ExtractionInput {
  sessions: SessionSummary[];
  logIds: string[];
}

export function replayEpisodes(db: DrizzleDB): ExtractionInput {
  const unprocessed = getUnprocessedLogs(db);
  if (unprocessed.length === 0) {
    return { sessions: [], logIds: [] };
  }

  const logIds = unprocessed.map(l => l.id);

  // Group by sessionId
  const sessionMap = new Map<string, typeof unprocessed>();
  for (const log of unprocessed) {
    const group = sessionMap.get(log.sessionId) ?? [];
    group.push(log);
    sessionMap.set(log.sessionId, group);
  }

  const sessions: SessionSummary[] = [];
  for (const [sessionId, logs] of sessionMap) {
    // Sort by turnIndex
    logs.sort((a, b) => a.turnIndex - b.turnIndex);

    const toolsUsed = new Set<string>();
    const turns: SessionTurn[] = logs.map(l => {
      if (l.toolName) toolsUsed.add(l.toolName);

      let toolInput: unknown;
      if (l.toolInput) {
        try {
          toolInput = typeof l.toolInput === 'string' ? JSON.parse(l.toolInput) : l.toolInput;
        } catch {
          toolInput = l.toolInput;
        }
      }

      return {
        turnIndex: l.turnIndex,
        role: l.role,
        content: l.content,
        toolName: l.toolName ?? undefined,
        toolInput,
      };
    });

    sessions.push({
      sessionId,
      agentId: logs[0].agentId,
      projectId: logs[0].projectId ?? null,
      turns,
      toolsUsed: Array.from(toolsUsed),
      startedAt: logs[0].createdAt,
      endedAt: logs[logs.length - 1].createdAt,
    });
  }

  return { sessions, logIds };
}
