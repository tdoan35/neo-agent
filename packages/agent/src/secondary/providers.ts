/**
 * Model providers for the secondary agent path (Vercel AI SDK).
 *
 * Abstracts model creation behind a tier system:
 * - primary: Claude via @ai-sdk/anthropic (API key fallback)
 * - fallback: GLM 4.7 via z.ai (OpenAI-compatible)
 * - local: Ollama models
 * - emergency: OpenRouter
 *
 * Actual SDK imports are dynamic to avoid hard dependency.
 */

export type ModelTier = 'primary' | 'fallback' | 'local' | 'emergency';

export interface ModelConfig {
  tier: ModelTier;
  provider: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
}

/** Abstract language model interface (subset of Vercel AI SDK LanguageModel) */
export interface LanguageModelLike {
  modelId: string;
  provider: string;
}

const MODEL_CONFIGS: ModelConfig[] = [
  {
    tier: 'primary',
    provider: 'anthropic',
    model: 'claude-sonnet-4-6-20250514',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  {
    tier: 'fallback',
    provider: 'openai-compatible',
    model: 'glm-4.7',
    baseUrl: 'https://api.z.ai/v1',
    apiKey: process.env.ZAI_API_KEY,
  },
  {
    tier: 'local',
    provider: 'ollama',
    model: 'qwen3:8b',
    baseUrl: 'http://localhost:11434',
  },
  {
    tier: 'emergency',
    provider: 'openai-compatible',
    model: 'anthropic/claude-sonnet-4-6',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  },
];

/**
 * Get model configuration for a tier.
 */
export function getModelConfig(tier: ModelTier): ModelConfig {
  const config = MODEL_CONFIGS.find(c => c.tier === tier);
  if (!config) throw new Error(`No model configured for tier: ${tier}`);
  return config;
}

/**
 * Get all available model configurations.
 */
export function getAvailableModels(): ModelConfig[] {
  return [...MODEL_CONFIGS];
}

/**
 * Check if a model tier has the required credentials.
 */
export function isTierAvailable(tier: ModelTier): boolean {
  const config = getModelConfig(tier);
  // Local models don't need API keys
  if (config.provider === 'ollama') return true;
  // Others need API keys
  return !!config.apiKey;
}

/**
 * Get the tier priority order for fallback.
 */
export function getTierOrder(preferredTier?: ModelTier): ModelTier[] {
  const order: ModelTier[] = ['primary', 'fallback', 'local', 'emergency'];
  if (preferredTier) {
    // Move preferred to front
    const idx = order.indexOf(preferredTier);
    if (idx > 0) {
      order.splice(idx, 1);
      order.unshift(preferredTier);
    }
  }
  return order;
}
