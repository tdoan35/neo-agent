import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { createFact, createEntity, storeEmbedding, appendLog } from '@neo-agent/memory';
import type { FactType, EntityType } from '@neo-agent/shared';

interface ExtractionResult {
  type: string;
  content: string;
  entityName?: string;
  entityType?: string;
  confidence?: number;
}

/**
 * On-turn-end middleware: mirrors Stop hook.
 * Calls local Ollama for end-of-turn extraction.
 */
export async function onTurnEndMiddleware(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  assistantMessage: string,
  sessionId: string,
  ollamaUrl = 'http://localhost:11434',
  extractionModel = 'qwen3:8b',
  projectId?: string,
): Promise<void> {
  if (!assistantMessage || assistantMessage.length < 50) return;

  // Log assistant message
  appendLog(db, {
    sessionId,
    agentId,
    projectId,
    turnIndex: 0,
    role: 'assistant',
    content: assistantMessage.slice(0, 5000),
  });

  // Extract facts via local LLM
  let extractions: ExtractionResult[] = [];
  try {
    const resp = await fetch(`${ollamaUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: extractionModel,
        prompt: `Given this conversation turn, extract notable items. Return ONLY a JSON array.
Each item: { "type": "preference"|"decision"|"observation"|"lesson_learned", "content": "...", "entityName": "..." (optional), "entityType": "person"|"tool"|"service"|"concept" (optional), "confidence": 0.0-1.0 }
If nothing notable, return [].

Conversation:
${assistantMessage.slice(0, 4000)}`,
        stream: false,
        options: { temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (resp.ok) {
      const data = await resp.json() as { response: string };
      const match = data.response.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) extractions = parsed;
      }
    }
  } catch {
    return; // Extraction failure is non-critical
  }

  const validTypes = new Set(['preference', 'decision', 'observation', 'lesson_learned']);

  for (const item of extractions) {
    if (!validTypes.has(item.type)) continue;
    if (!item.content || typeof item.content !== 'string') continue;

    let entityId: string | undefined;
    if (item.entityName && item.entityType) {
      const entity = createEntity(db, {
        type: item.entityType as EntityType,
        name: item.entityName,
        scope: 'private',
        ownerAgent: agentId,
        sourceSessionId: sessionId,
        confidence: item.confidence ?? 0.7,
      });
      entityId = entity.id;
    }

    const fact = createFact(db, {
      type: item.type as FactType,
      content: item.content,
      entityId,
      scope: 'private',
      ownerAgent: agentId,
      projectId,
      sourceSessionId: sessionId,
      sourceType: 'extracted',
      extractedBy: extractionModel,
      confidence: item.confidence ?? 0.7,
    });

    try {
      const vec = await provider.embed(fact.content);
      storeEmbedding(db, { sourceType: 'fact', sourceId: fact.id, textContent: fact.content, vector: vec });
    } catch { /* non-critical */ }
  }
}
