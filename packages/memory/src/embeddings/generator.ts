import { EmbeddingError } from '@neo-agent/shared';

export interface EmbeddingProvider {
  embed(text: string): Promise<Float32Array>;
  embedBatch(texts: string[]): Promise<Float32Array[]>;
}

export interface OllamaEmbeddingConfig {
  baseUrl?: string;
  model?: string;
}

export function createOllamaEmbeddingProvider(config?: OllamaEmbeddingConfig): EmbeddingProvider {
  const baseUrl = config?.baseUrl ?? 'http://localhost:11434';
  const model = config?.model ?? 'nomic-embed-text';

  return {
    async embed(text: string): Promise<Float32Array> {
      const results = await embedTexts(baseUrl, model, [text]);
      return results[0];
    },

    async embedBatch(texts: string[]): Promise<Float32Array[]> {
      return embedTexts(baseUrl, model, texts);
    },
  };
}

async function embedTexts(baseUrl: string, model: string, texts: string[]): Promise<Float32Array[]> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
  } catch (err) {
    throw new EmbeddingError(`Failed to connect to Ollama at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new EmbeddingError(`Ollama embedding request failed (${response.status}): ${body}`);
  }

  const data = await response.json() as { embeddings: number[][] };

  if (!data.embeddings || !Array.isArray(data.embeddings)) {
    throw new EmbeddingError('Invalid response from Ollama: missing embeddings array');
  }

  return data.embeddings.map(vec => new Float32Array(vec));
}

/**
 * Mock embedding provider for testing. Produces deterministic vectors
 * based on a simple hash of the input text.
 */
export function createMockEmbeddingProvider(dimensions: number = 768): EmbeddingProvider {
  function hashEmbed(text: string): Float32Array {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    const vec = new Float32Array(dimensions);
    for (let i = 0; i < dimensions; i++) {
      vec[i] = Math.sin(hash + i * 0.1) * 0.5;
    }
    // Normalize to unit vector
    let norm = 0;
    for (let i = 0; i < dimensions; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < dimensions; i++) vec[i] /= norm;
    }
    return vec;
  }

  return {
    async embed(text: string) { return hashEmbed(text); },
    async embedBatch(texts: string[]) { return texts.map(hashEmbed); },
  };
}
