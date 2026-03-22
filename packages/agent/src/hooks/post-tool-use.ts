import type { DrizzleDB } from '@neo-agent/memory';
import { appendLog } from '@neo-agent/memory';

export interface PostToolUseHookInput {
  hook_event_name: 'PostToolUse';
  session_id: string;
  agent_id?: string;
  tool_name: string;
  tool_input: unknown;
  tool_response: unknown;
  tool_use_id: string;
  cwd: string;
  transcript_path: string;
  permission_mode?: string;
}

/** Truncate large tool responses for logging */
function summarizeResponse(response: unknown, maxLength = 500): string {
  const str = typeof response === 'string' ? response : JSON.stringify(response);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + `... (truncated, ${str.length} chars total)`;
}

// Track turn indices per session
const sessionTurnCounters = new Map<string, number>();

function getNextTurnIndex(sessionId: string): number {
  const current = sessionTurnCounters.get(sessionId) ?? 0;
  sessionTurnCounters.set(sessionId, current + 1);
  return current;
}

export function createPostToolUseHook(
  db: DrizzleDB,
  agentId: string,
  projectId?: string,
) {
  return async (input: PostToolUseHookInput) => {
    const turnIndex = getNextTurnIndex(input.session_id);

    // Log the tool call to session logs
    appendLog(db, {
      sessionId: input.session_id,
      agentId: input.agent_id ?? agentId,
      projectId,
      turnIndex,
      role: 'tool',
      content: JSON.stringify({
        tool: input.tool_name,
        input: input.tool_input,
        response: summarizeResponse(input.tool_response),
      }),
      toolName: input.tool_name,
      toolInput: input.tool_input as Record<string, unknown> | undefined,
    });

    // Return async: true — session logging shouldn't slow the agent
    return { async: true as const };
  };
}

/** Reset turn counter for a session (call at session end) */
export function resetSessionTurnCounter(sessionId: string): void {
  sessionTurnCounters.delete(sessionId);
}
