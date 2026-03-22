import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import type { AgentIdentity } from '@neo-agent/shared';
import { assembleSystemPrompt } from '../identity/soul.js';
import { onPromptMiddleware, resetSession } from '../middleware/on-prompt.js';
import { postToolCallMiddleware, resetTurnCounter } from '../middleware/post-tool-call.js';
import { onTurnEndMiddleware } from '../middleware/on-turn-end.js';
import { shouldCompact, compact, type CompactionConfig, DEFAULT_COMPACTION_CONFIG, type SummarizeFunction } from '../compaction/compactor.js';
import { routedGenerate, type GenerateFunction, type GenerateResult } from './router.js';
import { getBuiltinTools, type ToolDefinition } from './tools/definitions.js';
import type { ModelTier } from './providers.js';
import { randomUUID } from 'node:crypto';

export type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'response'; content: string }
  | { type: 'done'; totalTokens: number };

export interface SecondaryAgentConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  identity: AgentIdentity;
  agentId: string;
  projectId?: string;
  modelTier?: ModelTier;
  maxIterations?: number;
  generate: GenerateFunction;
  summarize?: SummarizeFunction;
  compactionConfig?: CompactionConfig;
  ollamaUrl?: string;
}

interface Message {
  role: string;
  content: string;
}

/**
 * Run the secondary agent loop (Vercel AI SDK path).
 * Yields events as the agent processes the prompt.
 */
export async function* runSecondaryAgent(
  config: SecondaryAgentConfig,
  prompt: string,
): AsyncGenerator<AgentEvent> {
  const {
    db, embeddingProvider, identity, agentId,
    projectId, modelTier, maxIterations = 20,
    generate, summarize, compactionConfig = DEFAULT_COMPACTION_CONFIG,
    ollamaUrl,
  } = config;

  const sessionId = randomUUID();
  const tools = getBuiltinTools();

  // 1. On-prompt middleware: inject context
  const context = await onPromptMiddleware(
    db, embeddingProvider, agentId, projectId ?? null, prompt, sessionId,
  );

  // Read SOUL.md content from identity
  const soulContent = identity.persona ?? 'You are a helpful AI assistant.';
  const systemPrompt = assembleSystemPrompt(soulContent, context);

  const messages: Message[] = [
    { role: 'user', content: prompt },
  ];

  let totalTokens = 0;

  for (let i = 0; i < maxIterations; i++) {
    // Check if compaction is needed
    if (shouldCompact(messages, compactionConfig) && summarize) {
      const result = await compact(
        db, embeddingProvider, agentId, messages,
        summarize, compactionConfig, projectId,
      );
      messages.length = 0;
      messages.push(...result.compactedMessages as Message[]);
    }

    // Generate
    let result: GenerateResult;
    try {
      result = await routedGenerate(
        { model: modelTier, system: systemPrompt, messages, tools: tools as any },
        generate,
        { preferredTier: modelTier },
      );
    } catch (err) {
      yield { type: 'response', content: `Error: ${err instanceof Error ? err.message : String(err)}` };
      break;
    }

    totalTokens += result.usage.totalTokens;

    // Process tool calls
    for (const step of result.steps) {
      for (const toolCall of step.toolCalls) {
        yield { type: 'tool_call', name: toolCall.toolName, input: toolCall.args };

        // Execute tool
        const toolDef = tools[toolCall.toolName];
        let toolResult: string = 'Tool not found';
        if (toolDef) {
          toolResult = await toolDef.execute(toolCall.args as Record<string, unknown>);
        }

        yield { type: 'tool_result', name: toolCall.toolName, result: toolResult };

        // Post-tool-call middleware
        await postToolCallMiddleware(db, agentId, sessionId, {
          toolName: toolCall.toolName,
          args: toolCall.args,
          result: toolResult,
        }, projectId);
      }
    }

    // Check if done
    if (result.finishReason === 'stop' || result.steps.every(s => s.toolCalls.length === 0)) {
      yield { type: 'response', content: result.text };

      // On-turn-end middleware
      await onTurnEndMiddleware(
        db, embeddingProvider, agentId, result.text,
        sessionId, ollamaUrl, undefined, projectId,
      );

      yield { type: 'done', totalTokens };
      break;
    }

    // Continue conversation
    messages.push({ role: 'assistant', content: result.text });
  }

  // Cleanup
  resetSession(sessionId);
  resetTurnCounter(sessionId);
}
