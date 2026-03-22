import { getModelConfig, getTierOrder, isTierAvailable, type ModelTier } from './providers.js';

export interface RouterConfig {
  preferredTier?: ModelTier;
  maxRetries?: number;
}

export interface GenerateParams {
  model?: ModelTier;
  system?: string;
  messages: Array<{ role: string; content: string }>;
  tools?: Record<string, unknown>;
  maxSteps?: number;
}

export interface GenerateResult {
  text: string;
  finishReason: string;
  usage: { totalTokens: number; promptTokens: number; completionTokens: number };
  steps: Array<{ toolCalls: Array<{ toolName: string; args: unknown }> }>;
  modelTier: ModelTier;
}

export type GenerateFunction = (params: GenerateParams & { modelConfig: ReturnType<typeof getModelConfig> }) => Promise<GenerateResult>;

/**
 * Routed text generation with automatic fallback across model tiers.
 *
 * Tries models in tier priority order. On failure, falls back to next tier.
 * Returns the result from the first successful model.
 */
export async function routedGenerate(
  params: GenerateParams,
  generate: GenerateFunction,
  config?: RouterConfig,
): Promise<GenerateResult> {
  const maxRetries = config?.maxRetries ?? 1;
  const tiers = getTierOrder(config?.preferredTier ?? params.model);
  const errors: Array<{ tier: ModelTier; error: Error }> = [];

  for (const tier of tiers) {
    if (!isTierAvailable(tier)) continue;

    const modelConfig = getModelConfig(tier);

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const result = await generate({ ...params, modelConfig });
        return { ...result, modelTier: tier };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        errors.push({ tier, error });
        // Don't retry on auth errors — fall to next tier
        if (error.message.includes('401') || error.message.includes('403') || error.message.includes('auth')) {
          break;
        }
      }
    }
  }

  throw new Error(
    `All model tiers failed:\n${errors.map(e => `  ${e.tier}: ${e.error.message}`).join('\n')}`
  );
}
