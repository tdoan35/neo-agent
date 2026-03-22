import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { assembleContext } from '@neo-agent/memory';

export interface PostCompactHookInput {
  hook_event_name: 'PostCompact';
  session_id: string;
  agent_id?: string;
  trigger: 'manual' | 'auto';
  compact_summary: string;
  cwd: string;
  transcript_path: string;
  permission_mode?: string;
}

export function createPostCompactHook(
  db: DrizzleDB,
  embeddingProvider: EmbeddingProvider,
  agentId: string,
  projectId?: string,
) {
  return async (input: PostCompactHookInput) => {
    // Full context reassembly after compaction
    const context = await assembleContext(
      db,
      embeddingProvider,
      input.agent_id ?? agentId,
      projectId ?? null,
      '', // no specific prompt
      { mode: 'PostCompact' as any },
    );

    const note = '> Context was compacted. Working memory and knowledge base have been re-injected below.';
    const fullContext = context ? `${note}\n\n${context}` : note;

    // Use systemMessage for PostCompact — it may not have hookSpecificOutput with additionalContext
    return {
      systemMessage: fullContext,
    };
  };
}
