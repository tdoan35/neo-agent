import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { createSessionStartHook } from './session-start.js';
import { createUserPromptHook } from './user-prompt.js';
import { createPostToolUseHook } from './post-tool-use.js';
import { createPreCompactHook } from './pre-compact.js';
import { createPostCompactHook } from './post-compact.js';
import { createStopHook, type StopHookConfig } from './stop.js';

export interface HookPipelineConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  agentId: string;
  projectId?: string;
  stopHookConfig?: StopHookConfig;
}

/**
 * Creates the complete hook pipeline for memory-critical events.
 * Returns a hooks object compatible with the Agent SDK query() options.
 */
export function createHookPipeline(config: HookPipelineConfig) {
  const { db, embeddingProvider, agentId, projectId, stopHookConfig } = config;

  return {
    SessionStart: [{ hooks: [createSessionStartHook(db, embeddingProvider, agentId, projectId)] }],
    UserPromptSubmit: [{ hooks: [createUserPromptHook(db, embeddingProvider, agentId, projectId)] }],
    PostToolUse: [{ hooks: [createPostToolUseHook(db, agentId, projectId)] }],
    PreCompact: [{ hooks: [createPreCompactHook(db, agentId, projectId)] }],
    PostCompact: [{ hooks: [createPostCompactHook(db, embeddingProvider, agentId, projectId)] }],
    Stop: [{ hooks: [createStopHook(db, embeddingProvider, agentId, projectId, stopHookConfig)] }],
  };
}

export { createSessionStartHook } from './session-start.js';
export { createUserPromptHook } from './user-prompt.js';
export { createPostToolUseHook, resetSessionTurnCounter } from './post-tool-use.js';
export { createPreCompactHook } from './pre-compact.js';
export { createPostCompactHook } from './post-compact.js';
export { createStopHook } from './stop.js';
export type { StopHookConfig } from './stop.js';
