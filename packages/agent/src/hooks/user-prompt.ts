import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { assembleContext } from '@neo-agent/memory';

export interface UserPromptSubmitHookInput {
  hook_event_name: 'UserPromptSubmit';
  session_id: string;
  prompt: string;
  agent_id?: string;
  cwd: string;
  transcript_path: string;
  permission_mode?: string;
}

export interface UserPromptSubmitHookSpecificOutput {
  hookEventName: 'UserPromptSubmit';
  additionalContext?: string;
}

export function createUserPromptHook(
  db: DrizzleDB,
  embeddingProvider: EmbeddingProvider,
  agentId: string,
  projectId?: string,
) {
  return async (input: UserPromptSubmitHookInput) => {
    // PerPrompt mode only returns blocks 4-5 (relevant knowledge + skills)
    const context = await assembleContext(
      db,
      embeddingProvider,
      input.agent_id ?? agentId,
      projectId ?? null,
      input.prompt,
      { mode: 'PerPrompt' },
    );

    return {
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit' as const,
        additionalContext: context || undefined,
      },
    };
  };
}
