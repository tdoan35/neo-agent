import type { DrizzleDB } from '@neo-agent/memory';
import { appendLog } from '@neo-agent/memory';

// Track turn indices per session
const sessionTurnCounters = new Map<string, number>();

function getNextTurnIndex(sessionId: string): number {
  const current = sessionTurnCounters.get(sessionId) ?? 0;
  sessionTurnCounters.set(sessionId, current + 1);
  return current;
}

function summarizeResponse(response: unknown, maxLength = 500): string {
  const str = typeof response === 'string' ? response : JSON.stringify(response);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + `... (truncated)`;
}

/**
 * Post-tool-call middleware: mirrors PostToolUse hook.
 * Logs tool calls to session_logs.
 */
export async function postToolCallMiddleware(
  db: DrizzleDB,
  agentId: string,
  sessionId: string,
  toolCall: { toolName: string; args: unknown; result?: unknown },
  projectId?: string,
): Promise<void> {
  const turnIndex = getNextTurnIndex(sessionId);

  appendLog(db, {
    sessionId,
    agentId,
    projectId,
    turnIndex,
    role: 'tool',
    content: JSON.stringify({
      tool: toolCall.toolName,
      input: toolCall.args,
      response: toolCall.result ? summarizeResponse(toolCall.result) : undefined,
    }),
    toolName: toolCall.toolName,
    toolInput: toolCall.args as Record<string, unknown> | undefined,
  });
}

/** Reset turn counter for a session */
export function resetTurnCounter(sessionId: string): void {
  sessionTurnCounters.delete(sessionId);
}
