import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { createMemoryMcpServer } from '@neo-agent/mcp-server';
import { createHookPipeline, type HookPipelineConfig } from '../hooks/index.js';
import { loadSoulFile, assembleSystemPrompt } from '../identity/soul.js';
import type { StopHookConfig } from '../hooks/stop.js';

export interface AgentSessionConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  agentId: string;
  projectId?: string;
  soulFilePath?: string;
  model?: string;
  ollamaUrl?: string;
  extractionModel?: string;
}

export interface AgentSession {
  hooks: ReturnType<typeof createHookPipeline>;
  mcpServerConfig: { type: 'sdk'; name: string; instance: ReturnType<typeof createMemoryMcpServer> };
  systemPrompt: string;
  agentId: string;
  projectId?: string;
  model?: string;
}

/**
 * Prepare an agent session with memory hooks and MCP server configured.
 *
 * This creates all the pieces needed to call the Agent SDK's query():
 * - Hook pipeline (6 memory-critical hooks)
 * - MCP server (in-process, with 6 memory tools)
 * - System prompt (SOUL.md + memory instructions)
 *
 * Usage:
 * ```ts
 * const session = await prepareAgentSession(config);
 * const q = query({
 *   prompt: userMessage,
 *   options: {
 *     model: session.model,
 *     hooks: session.hooks,
 *     mcpServers: { memory: session.mcpServerConfig },
 *     systemPrompt: session.systemPrompt,
 *   },
 * });
 * ```
 */
export async function prepareAgentSession(config: AgentSessionConfig): Promise<AgentSession> {
  const {
    db,
    embeddingProvider,
    agentId,
    projectId,
    soulFilePath,
    model,
    ollamaUrl,
    extractionModel,
  } = config;

  // Load identity
  const soulContent = await loadSoulFile(soulFilePath ?? '~/.agent/SOUL.md');
  const systemPrompt = assembleSystemPrompt(soulContent);

  // Create stop hook config
  const stopHookConfig: StopHookConfig = {
    ollamaUrl: ollamaUrl ?? 'http://localhost:11434',
    extractionModel: extractionModel ?? 'qwen3:8b',
  };

  // Create hook pipeline
  const hookConfig: HookPipelineConfig = {
    db,
    embeddingProvider,
    agentId,
    projectId,
    stopHookConfig,
  };
  const hooks = createHookPipeline(hookConfig);

  // Create in-process MCP server
  const mcpServer = createMemoryMcpServer({
    db,
    embeddingProvider,
    agentId,
    projectId,
  });

  const mcpServerConfig = {
    type: 'sdk' as const,
    name: 'memory',
    instance: mcpServer,
  };

  return {
    hooks,
    mcpServerConfig,
    systemPrompt,
    agentId,
    projectId,
    model,
  };
}
