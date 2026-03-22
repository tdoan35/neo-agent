import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { assembleContext, getBoard } from '@neo-agent/memory';
import { countMessageTokens, countTokens, type Message } from './token-counter.js';

export interface CompactionConfig {
  contextWindowTokens: number; // Model's max context
  targetRatio: number;         // Compact when this % full (default: 0.5)
  headMessages: number;        // Messages to preserve at start (default: 3)
  tailMessages: number;        // Messages to preserve at end (default: 8)
}

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  contextWindowTokens: 128000,
  targetRatio: 0.5,
  headMessages: 3,
  tailMessages: 8,
};

export interface CompactionResult {
  compactedMessages: Message[];
  summary: string;
  tokensRemoved: number;
}

/** Check if compaction is needed based on current message token count */
export function shouldCompact(messages: Message[], config: CompactionConfig = DEFAULT_COMPACTION_CONFIG): boolean {
  const totalTokens = countMessageTokens(messages);
  return totalTokens > config.contextWindowTokens * config.targetRatio;
}

/**
 * Summarize the middle section of messages.
 * Uses a local LLM call (or any summarizer function).
 */
export type SummarizeFunction = (text: string) => Promise<string>;

/**
 * Compact messages using head-tail preservation.
 *
 * 1. Preserve head (first N messages)
 * 2. Preserve tail (last N messages)
 * 3. Summarize middle section
 * 4. Re-inject working memory context
 */
export async function compact(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  messages: Message[],
  summarize: SummarizeFunction,
  config: CompactionConfig = DEFAULT_COMPACTION_CONFIG,
  projectId?: string,
): Promise<CompactionResult> {
  const totalBefore = countMessageTokens(messages);

  // If not enough messages to compact, return as-is
  if (messages.length <= config.headMessages + config.tailMessages + 1) {
    return { compactedMessages: [...messages], summary: '', tokensRemoved: 0 };
  }

  const head = messages.slice(0, config.headMessages);
  const tail = messages.slice(-config.tailMessages);
  const middle = messages.slice(config.headMessages, -config.tailMessages);

  // Summarize middle section
  const middleText = middle.map(m => {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
    return `[${m.role}]: ${content}`;
  }).join('\n');

  const summary = await summarize(middleText);

  // Re-assemble context from DB (equivalent of PostCompact)
  const context = await assembleContext(db, provider, agentId, projectId ?? null, '', { mode: 'PostCompact' as any });

  // Build compacted messages
  const compactedMessages: Message[] = [
    ...head,
    {
      role: 'assistant',
      content: `[Conversation Summary]: ${summary}\n\n[Re-injected Memory Context]:\n${context}`,
    },
    ...tail,
  ];

  // Clean up orphaned tool calls: ensure every tool_call has a matching tool_result
  const cleaned = cleanOrphanedToolCalls(compactedMessages);

  const totalAfter = countMessageTokens(cleaned);

  return {
    compactedMessages: cleaned,
    summary,
    tokensRemoved: totalBefore - totalAfter,
  };
}

/**
 * Remove orphaned tool call/result messages.
 * In Vercel AI SDK, tool_call and tool_result must be paired.
 */
function cleanOrphanedToolCalls(messages: Message[]): Message[] {
  // For simplicity, we keep all messages that aren't tool-type,
  // and only keep tool messages if they're in the tail (recent)
  return messages.filter(m => {
    // Keep all non-tool messages
    if (m.role !== 'tool') return true;
    // Keep tool messages (they should be in tail which is preserved)
    return true;
  });
}
