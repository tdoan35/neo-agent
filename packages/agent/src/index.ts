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

// Secondary agent (Vercel AI SDK path)
export { runSecondaryAgent } from './secondary/vercel-agent.js';
export type { AgentEvent, SecondaryAgentConfig } from './secondary/vercel-agent.js';
export { getModelConfig, getAvailableModels, isTierAvailable, getTierOrder } from './secondary/providers.js';
export type { ModelTier, ModelConfig } from './secondary/providers.js';
export { routedGenerate } from './secondary/router.js';
export type { RouterConfig, GenerateFunction, GenerateResult, GenerateParams } from './secondary/router.js';
export { getBuiltinTools } from './secondary/tools/definitions.js';
export type { ToolDefinition } from './secondary/tools/definitions.js';

// Middleware (shared between primary and secondary paths)
export { onPromptMiddleware, resetSession } from './middleware/on-prompt.js';
export { postToolCallMiddleware, resetTurnCounter } from './middleware/post-tool-call.js';
export { onTurnEndMiddleware } from './middleware/on-turn-end.js';

// Compaction
export { shouldCompact, compact, DEFAULT_COMPACTION_CONFIG } from './compaction/compactor.js';
export type { CompactionConfig, CompactionResult, SummarizeFunction } from './compaction/compactor.js';
export { countTokens, countMessageTokens } from './compaction/token-counter.js';
