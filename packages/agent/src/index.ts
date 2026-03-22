export { createHookPipeline } from './hooks/index.js';
export type { HookPipelineConfig } from './hooks/index.js';
export {
  createSessionStartHook,
  createUserPromptHook,
  createPostToolUseHook,
  createPreCompactHook,
  createPostCompactHook,
  createStopHook,
  resetSessionTurnCounter,
} from './hooks/index.js';
export type { StopHookConfig } from './hooks/index.js';

export { prepareAgentSession } from './primary/claude-agent.js';
export type { AgentSessionConfig, AgentSession } from './primary/claude-agent.js';

export { detectAuth, isAuthConfigured } from './primary/auth.js';
export type { AuthMethod, AuthConfig } from './primary/auth.js';

export { loadSoulFile, assembleSystemPrompt, MEMORY_INSTRUCTIONS } from './identity/soul.js';
