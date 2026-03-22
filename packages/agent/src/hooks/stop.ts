import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { createFact, createEntity, storeEmbedding, appendLog } from '@neo-agent/memory';
import type { FactType, EntityType } from '@neo-agent/shared';

export interface StopHookInput {
  hook_event_name: 'Stop';
  session_id: string;
  agent_id?: string;
  stop_hook_active: boolean;
  last_assistant_message?: string;
  cwd: string;
  transcript_path: string;
  permission_mode?: string;
}

interface ExtractionResult {
  type: 'preference' | 'decision' | 'observation' | 'lesson_learned';
  content: string;
  entityName?: string;
  entityType?: EntityType;
  confidence?: number;
}

/** Call local Ollama for end-of-turn extraction */
async function callOllamaExtraction(
  ollamaUrl: string,
  model: string,
  message: string,
): Promise<ExtractionResult[]> {
  const extractionPrompt = `Given this conversation turn, extract any notable items. Return ONLY a JSON array (no markdown, no explanation).

Each item should be: { "type": "preference"|"decision"|"observation"|"lesson_learned", "content": "...", "entityName": "..." (optional), "entityType": "person"|"tool"|"service"|"concept"|"codebase"|"framework" (optional), "confidence": 0.0-1.0 }

If nothing notable, return [].

Conversation:
${message.slice(0, 4000)}`;

  try {
    const resp = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: extractionPrompt,
        stream: false,
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(30000), // 30s timeout
    });

    if (!resp.ok) return [];

    const data = await resp.json() as { response: string };
    // Extract JSON array from response (may have surrounding text)
    const match = data.response.match(/\[[\s\S]*\]/);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export interface StopHookConfig {
  ollamaUrl?: string;
  extractionModel?: string;
}

export function createStopHook(
  db: DrizzleDB,
  embeddingProvider: EmbeddingProvider,
  agentId: string,
  projectId?: string,
  config?: StopHookConfig,
) {
  const ollamaUrl = config?.ollamaUrl ?? 'http://localhost:11434';
  const model = config?.extractionModel ?? 'qwen3:8b';

  return async (input: StopHookInput) => {
    // Avoid re-entrancy
    if (input.stop_hook_active) {
      return { async: true as const };
    }

    const message = input.last_assistant_message;
    if (!message || message.length < 50) {
      // Too short to extract anything meaningful
      return { async: true as const };
    }

    // Log the assistant's final message
    appendLog(db, {
      sessionId: input.session_id,
      agentId: input.agent_id ?? agentId,
      projectId,
      turnIndex: 0, // Stop hook doesn't have a turn index — use 0
      role: 'assistant',
      content: message.slice(0, 5000), // Truncate for storage
    });

    // Extract facts via local LLM
    const extractions = await callOllamaExtraction(ollamaUrl, model, message);

    for (const item of extractions) {
      // Validate type
      const validTypes = ['preference', 'decision', 'observation', 'lesson_learned'];
      if (!validTypes.includes(item.type)) continue;
      if (!item.content || typeof item.content !== 'string') continue;

      // Create entity if specified
      let entityId: string | undefined;
      if (item.entityName && item.entityType) {
        const entity = createEntity(db, {
          type: item.entityType,
          name: item.entityName,
          scope: 'private',
          ownerAgent: input.agent_id ?? agentId,
          sourceSessionId: input.session_id,
          confidence: item.confidence ?? 0.7,
        });
        entityId = entity.id;
      }

      // Create fact
      const fact = createFact(db, {
        type: item.type as FactType,
        content: item.content,
        entityId,
        scope: 'private',
        ownerAgent: input.agent_id ?? agentId,
        projectId,
        sourceSessionId: input.session_id,
        sourceType: 'extracted',
        extractedBy: model,
        confidence: item.confidence ?? 0.7,
      });

      // Generate and store embedding
      try {
        const vec = await embeddingProvider.embed(fact.content);
        storeEmbedding(db, {
          sourceType: 'fact',
          sourceId: fact.id,
          textContent: fact.content,
          vector: vec,
        });
      } catch {
        // Embedding failure is non-critical
      }
    }

    return { async: true as const };
  };
}
