import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { assembleContext } from '@neo-agent/memory';

// Track whether this is the first prompt in a session
const sessionFirstPrompt = new Set<string>();

/**
 * On-prompt middleware: mirrors SessionStart + UserPromptSubmit hooks.
 *
 * First prompt → SessionStart mode (all 5 blocks).
 * Subsequent prompts → PerPrompt mode (blocks 4-5 only).
 */
export async function onPromptMiddleware(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  projectId: string | null,
  prompt: string,
  sessionId: string,
): Promise<string> {
  const isFirst = !sessionFirstPrompt.has(sessionId);
  if (isFirst) {
    sessionFirstPrompt.add(sessionId);
  }

  const mode = isFirst ? 'SessionStart' : 'PerPrompt';

  return assembleContext(db, provider, agentId, projectId, prompt, { mode: mode as any });
}

/** Reset first-prompt tracking for a session */
export function resetSession(sessionId: string): void {
  sessionFirstPrompt.delete(sessionId);
}
