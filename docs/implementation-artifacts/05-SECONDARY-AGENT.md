# Phase 5: Secondary Agent — Vercel AI SDK

## Overview

Integration of non-Claude models (GLM 4.7, local Ollama, OpenRouter) via the Vercel AI SDK with a custom middleware layer that mirrors the Agent SDK's hook pipeline. This gives the memory system model-agnostic support — the same memory layer works regardless of which model path is active.

**Estimated effort**: 5-7 days

---

## Prerequisites

- Phases 1-2 complete (memory layer + hook patterns established)
- Install:
  - `ai` (Vercel AI SDK core)
  - `@ai-sdk/anthropic` (for Claude via API key as fallback)
  - `@ai-sdk/openai` (OpenAI-compatible API for GLM/OpenRouter)
  - `ollama-ai-provider` (Ollama provider)

---

## Dependency Graph

```
packages/agent/
  src/
    secondary/
      vercel-agent.ts         (agent loop with generateText)
      providers.ts            (model provider setup)
      router.ts               (model routing with fallback chain)
    middleware/
      on-prompt.ts            (mirrors SessionStart + UserPromptSubmit)
      post-tool-call.ts       (mirrors PostToolUse)
      on-turn-end.ts          (mirrors Stop)
    compaction/
      compactor.ts            (custom context compression)
      token-counter.ts        (token counting for budget)
    tools/
      definitions.ts          (tool definitions for generateText)
    index.ts
```

---

## Implementation Units

### 5.1 Model Providers

#### Files

- `packages/agent/src/secondary/providers.ts`

#### Key Interface

```typescript
type ModelTier = 'primary' | 'fallback' | 'local' | 'emergency';

interface ModelConfig {
  tier: ModelTier;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

function getModel(tier: ModelTier): LanguageModel
function getAvailableModels(): ModelConfig[]
```

#### Provider Setup

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { ollama } from 'ollama-ai-provider';

function getModel(tier: ModelTier) {
  switch (tier) {
    case 'primary':
      return anthropic('claude-sonnet-4-6-20250514');
    case 'fallback':
      return createOpenAI({ baseURL: 'https://api.z.ai/v1', apiKey: process.env.ZAI_API_KEY })('glm-4.7');
    case 'local':
      return ollama('qwen3:8b');
    case 'emergency':
      return createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY })('anthropic/claude-sonnet-4-6');
  }
}
```

---

### 5.2 Model Router

#### Files

- `packages/agent/src/secondary/router.ts`

#### Key Interface

```typescript
interface RouterConfig {
  preferredTier?: ModelTier;
  maxRetries?: number;
}

async function routedGenerateText(
  params: Parameters<typeof generateText>[0],
  config?: RouterConfig
): ReturnType<typeof generateText>
```

#### Implementation Notes

Tries models in tier order. On failure (rate limit, timeout, auth error), falls back to next tier:

1. Try `primary` (or `preferredTier`)
2. On failure → try `fallback`
3. On failure → try `local`
4. On failure → try `emergency`
5. All fail → throw

Log which model was used for observability.

---

### 5.3 Tool Definitions

#### Files

- `packages/agent/src/secondary/tools/definitions.ts`

#### Implementation Notes

Define tools compatible with Vercel AI SDK's `tool()` helper:

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const readFileTool = tool({
  description: 'Read a file from the filesystem',
  parameters: z.object({
    path: z.string().describe('File path to read'),
  }),
  execute: async ({ path }) => {
    // Implementation: read file, return content
  },
});
```

**Tool set** should mirror the Agent SDK's built-in tools (subset):
- `readFile` — read file content
- `writeFile` — write/create file
- `editFile` — edit file with search/replace
- `bash` — execute shell command
- `glob` — find files by pattern
- `grep` — search file contents
- `webSearch` — web search (if available)

Plus the MCP memory tools (connected separately).

For the secondary path, MCP tools are invoked via the MCP client library rather than the in-process SDK server. The memory MCP server runs as a standalone process (stdio transport) or is called directly via function calls.

---

### 5.4 Agent Loop

#### Files

- `packages/agent/src/secondary/vercel-agent.ts`

#### Key Interface

```typescript
interface SecondaryAgentConfig {
  gateway: Gateway;
  identity: AgentIdentity;
  modelTier?: ModelTier;
  maxIterations?: number;   // default: 20
}

async function* runSecondaryAgent(
  config: SecondaryAgentConfig,
  prompt: string
): AsyncGenerator<AgentEvent>

type AgentEvent =
  | { type: 'thinking'; content: string }
  | { type: 'tool_call'; name: string; input: unknown }
  | { type: 'tool_result'; name: string; result: unknown }
  | { type: 'response'; content: string }
  | { type: 'done'; totalTokens: number }
```

#### Implementation Notes

ReAct loop using `generateText`:

```typescript
async function* runSecondaryAgent(config, prompt) {
  const { db, embeddingProvider } = config.gateway;
  const messages: CoreMessage[] = [];

  // 1. On-prompt middleware: inject context
  const context = await onPromptMiddleware(db, embeddingProvider, agentId, projectId, prompt);
  const systemPrompt = assembleSystemPrompt(config.identity, context);

  messages.push({ role: 'user', content: prompt });

  for (let i = 0; i < config.maxIterations; i++) {
    const result = await routedGenerateText({
      model: getModel(config.modelTier ?? 'fallback'),
      system: systemPrompt,
      messages,
      tools: { ...builtinTools, ...memoryTools },
      maxSteps: 5,  // Allow multi-step within single generateText call
    });

    // 2. Post-tool-call middleware: log + extract
    for (const step of result.steps) {
      for (const toolCall of step.toolCalls) {
        await postToolCallMiddleware(db, agentId, sessionId, toolCall);
        yield { type: 'tool_call', name: toolCall.toolName, input: toolCall.args };
      }
    }

    // Check if done (no more tool calls)
    if (result.finishReason === 'stop') {
      yield { type: 'response', content: result.text };

      // 3. On-turn-end middleware: extraction
      await onTurnEndMiddleware(db, embeddingProvider, agentId, result.text);

      yield { type: 'done', totalTokens: result.usage.totalTokens };
      break;
    }

    // Add assistant response to messages for next iteration
    messages.push({ role: 'assistant', content: result.text });
  }
}
```

---

### 5.5 Middleware Layer

#### Files

- `packages/agent/src/middleware/on-prompt.ts`
- `packages/agent/src/middleware/post-tool-call.ts`
- `packages/agent/src/middleware/on-turn-end.ts`

These mirror the Agent SDK hooks but are simpler — no hook protocol, just function calls.

#### on-prompt (mirrors SessionStart + UserPromptSubmit)

```typescript
async function onPromptMiddleware(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  projectId: string | null,
  prompt: string
): Promise<string>
// Calls assembleContext() with mode 'SessionStart' for first prompt, 'PerPrompt' thereafter
// Returns the assembled context string to prepend to system prompt
```

#### post-tool-call (mirrors PostToolUse)

```typescript
async function postToolCallMiddleware(
  db: DrizzleDB,
  agentId: string,
  sessionId: string,
  toolCall: { toolName: string; args: unknown; result: unknown }
): Promise<void>
// Logs to session_logs
// Applies same rule-based extraction as the Agent SDK PostToolUse hook
```

#### on-turn-end (mirrors Stop)

```typescript
async function onTurnEndMiddleware(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  assistantMessage: string
): Promise<void>
// Calls local Ollama for end-of-turn fact extraction (same prompt as Stop hook)
// Stores extracted facts + generates embeddings
// Flushes session log
```

---

### 5.6 Custom Compaction

#### Files

- `packages/agent/src/compaction/compactor.ts`
- `packages/agent/src/compaction/token-counter.ts`

#### Key Interface

```typescript
interface CompactionConfig {
  contextWindowTokens: number;  // Model's max context
  targetRatio: number;          // default: 0.5 (compact when 50% full)
}

function shouldCompact(messages: CoreMessage[], config: CompactionConfig): boolean

async function compact(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  messages: CoreMessage[],
  config: CompactionConfig
): Promise<{
  compactedMessages: CoreMessage[];
  summary: string;
}>
```

#### Compaction Algorithm: Head-Tail Preservation

1. **Check threshold**: Count total tokens in `messages`. If < `contextWindowTokens * targetRatio`, don't compact.

2. **Preserve head**: Keep the first 2-3 messages (system context, initial prompt) unchanged.

3. **Preserve tail**: Keep the last 5-10 messages (recent conversation) unchanged.

4. **Compress middle**: Summarize the middle section:
   - Call local Ollama model with the middle messages
   - Prompt: "Summarize this conversation section, preserving: decisions made, tools used, results obtained, blockers encountered"
   - Replace middle messages with a single `{ role: 'assistant', content: '[Summary]: ...' }` message

5. **Working memory snapshot**: Before compaction, call the equivalent of PreCompact:
   - Persist all working memory state to DB

6. **Re-inject after compaction**: Equivalent of PostCompact:
   - Reassemble full context (all 5 blocks) from DB
   - Prepend to the compacted messages as updated system context

7. **Orphan cleanup**: Remove any tool_call messages whose corresponding tool_result was in the compressed middle section, and vice versa. Vercel AI SDK requires paired tool messages.

#### Token Counting

```typescript
function countTokens(text: string): number {
  // Rough estimation: chars / 4
  // For more accuracy, use tiktoken or the model's tokenizer
  return Math.ceil(text.length / 4);
}

function countMessageTokens(messages: CoreMessage[]): number {
  return messages.reduce((sum, m) => sum + countTokens(typeof m.content === 'string' ? m.content : JSON.stringify(m.content)), 0);
}
```

---

## Test Strategy

### Test Files

- `packages/agent/tests/secondary/providers.test.ts`
- `packages/agent/tests/secondary/router.test.ts`
- `packages/agent/tests/secondary/vercel-agent.test.ts`
- `packages/agent/tests/middleware/on-prompt.test.ts`
- `packages/agent/tests/middleware/post-tool-call.test.ts`
- `packages/agent/tests/middleware/on-turn-end.test.ts`
- `packages/agent/tests/compaction/compactor.test.ts`

### Key Test Cases

**Providers:**
- Each provider creates a valid LanguageModel object
- Missing API key → appropriate error

**Router:**
- Primary succeeds → uses primary
- Primary fails → falls back to fallback
- All fail → throws

**Middleware:**
- on-prompt: returns assembled context string
- post-tool-call: session log entry created
- on-turn-end: extraction prompt sent (mock LLM), facts stored

**Compaction:**
- Below threshold → no compaction
- Above threshold → middle messages compressed
- Head and tail preserved
- Working memory state survives compaction
- Orphaned tool calls cleaned up

**Integration** (with mock LLM):
- Run secondary agent with simple prompt
- Verify middleware fires at correct points
- Verify session logs written
- Verify working memory accessible

---

## Acceptance Criteria

- [ ] Can have a conversation with GLM via Vercel AI SDK
- [ ] Can have a conversation with local Ollama model
- [ ] Model router falls back correctly on failure
- [ ] All middleware fires and writes to same memory DB
- [ ] Session logs captured by post-tool-call middleware
- [ ] End-of-turn extraction runs via on-turn-end middleware
- [ ] Custom compaction works (middle compressed, head/tail preserved)
- [ ] Working memory survives compaction on secondary path
- [ ] Same memory available regardless of which model path is active
- [ ] All tests pass

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Vercel AI SDK tool definition format differs from Agent SDK | Tools defined independently for each path. Same underlying logic, different wrapper |
| GLM 4.7 / z.ai API compatibility with OpenAI-compatible format | z.ai is OpenAI-compatible. Test with actual API during development. Have OpenRouter as emergency fallback |
| Custom compaction quality vs Agent SDK's built-in | Agent SDK compaction is well-tuned. Our custom version is simpler (head-tail preservation). Acceptable for fallback path — the hooks ensure memory survives regardless |
| Orphaned tool call cleanup is fragile | Strict pairing check: iterate messages, ensure every tool_call has a matching tool_result. Remove unmatched pairs |
| Token counting is imprecise without proper tokenizer | chars/4 is a conservative estimate. Over-counting means we compact slightly too early — better than too late |
