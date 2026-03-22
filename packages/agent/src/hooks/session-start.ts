import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { assembleContext } from '@neo-agent/memory';

export interface SessionStartHookInput {
  hook_event_name: 'SessionStart';
  session_id: string;
  source: 'startup' | 'resume' | 'clear' | 'compact';
  agent_id?: string;
  cwd: string;
  transcript_path: string;
  permission_mode?: string;
  model?: string;
}

export interface SessionStartHookSpecificOutput {
  hookEventName: 'SessionStart';
  additionalContext?: string;
}

export function createSessionStartHook(
  db: DrizzleDB,
  embeddingProvider: EmbeddingProvider,
  agentId: string,
  projectId?: string,
) {
  return async (input: SessionStartHookInput) => {
    // On compact source, the SDK fires SessionStart after compaction
    // Use PostCompact mode for full re-injection
    const mode = input.source === 'compact' ? 'PostCompact' : 'SessionStart';

    const context = await assembleContext(
      db,
      embeddingProvider,
      input.agent_id ?? agentId,
      projectId ?? null,
      '', // no prompt at session start
      { mode: mode as any },
    );

    return {
      hookSpecificOutput: {
        hookEventName: 'SessionStart' as const,
        additionalContext: context || undefined,
      },
    };
  };
}
