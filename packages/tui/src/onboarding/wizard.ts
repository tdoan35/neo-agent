import type { FactType } from '@neo-agent/shared';
import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { createFact, createEntity, storeEmbedding, listFacts, createIdentity } from '@neo-agent/memory';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export interface OnboardingAnswers {
  name: string;
  role: string;
  primaryUse: string;
  communicationStyle: 'concise' | 'detailed';
  tools: string[];
}

export interface OnboardingResult {
  userEntityId: string;
  identityId: string;
  factCount: number;
}

/** Check if onboarding has been completed (any biographical facts exist) */
export function needsOnboarding(db: DrizzleDB): boolean {
  const facts = listFacts(db, { scope: 'global', type: 'biographical' });
  return facts.length === 0;
}

const PRESET_META: Record<string, { role: string; tone: string; color: string; letter: string; persona: string }> = {
  dana: {
    role: 'Executive Assistant',
    tone: 'stern and direct',
    color: '#E63946',
    letter: 'D',
    persona: 'Stern, direct, accountability-focused. No sugar-coating.',
  },
  carlos: {
    role: 'Executive Assistant',
    tone: 'short and professional',
    color: '#457B9D',
    letter: 'C',
    persona: 'Action items and status updates. Efficient and structured.',
  },
  yuki: {
    role: 'Executive Assistant',
    tone: 'quick and witty',
    color: '#2A9D8F',
    letter: 'Y',
    persona: 'Quick-witted, energetic, makes work feel lighter.',
  },
  aria: {
    role: 'Research Assistant',
    tone: 'thoughtful and adaptive',
    color: '#9B5DE5',
    letter: 'A',
    persona: 'Deep research, analysis, connecting ideas across domains.',
  },
};

/** Process onboarding answers: create user entity, store facts, create identity */
export async function processOnboarding(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  answers: OnboardingAnswers,
  agentPreset: string, // 'dana', 'carlos', 'yuki', 'aria', or 'custom'
  presetsDir?: string,
): Promise<OnboardingResult> {
  // Create user entity
  const userEntity = createEntity(db, {
    type: 'person',
    name: answers.name,
    description: answers.role,
    scope: 'global',
    confidence: 1.0,
  });

  // Store biographical facts
  const factsToStore: Array<{ type: FactType; content: string }> = [
    { type: 'biographical', content: `User's name is ${answers.name}` },
    { type: 'biographical', content: `User's role: ${answers.role}` },
    { type: 'preference', content: `Primary use case: ${answers.primaryUse}` },
    { type: 'preference', content: `Communication preference: ${answers.communicationStyle}` },
  ];

  if (answers.tools.length > 0) {
    factsToStore.push({
      type: 'environmental',
      content: `Daily tools: ${answers.tools.join(', ')}`,
    });
  }

  let factCount = 0;
  for (const f of factsToStore) {
    const fact = createFact(db, {
      type: f.type,
      content: f.content,
      entityId: userEntity.id,
      scope: 'global',
      sourceType: 'stated',
      confidence: 1.0,
    });

    try {
      const vec = await provider.embed(fact.content);
      storeEmbedding(db, {
        sourceType: 'fact',
        sourceId: fact.id,
        textContent: fact.content,
        vector: vec,
      });
    } catch {
      // Non-critical
    }
    factCount++;
  }

  // Resolve preset metadata
  const meta = PRESET_META[agentPreset.toLowerCase()] ?? {
    role: 'Assistant',
    tone: 'helpful and adaptive',
    color: '#6C757D',
    letter: 'C',
    persona: 'A helpful AI assistant.',
  };

  // Load SOUL.md preset file
  const dir = presetsDir ?? join(process.cwd(), 'config', 'identities');
  const presetPath = join(dir, `${agentPreset.toLowerCase()}.md`);
  const soulPath = existsSync(presetPath) ? presetPath : '';

  const displayName = agentPreset.charAt(0).toUpperCase() + agentPreset.slice(1).toLowerCase();

  const identity = createIdentity(db, {
    name: displayName,
    role: meta.role,
    tone: meta.tone,
    avatar: { color: meta.color, letter: meta.letter },
    persona: meta.persona,
    soulPath,
    isPreset: agentPreset.toLowerCase() !== 'custom',
    createdFrom: agentPreset.toLowerCase() !== 'custom' ? agentPreset.toLowerCase() : undefined,
  });

  return {
    userEntityId: userEntity.id,
    identityId: identity.id,
    factCount,
  };
}

export const AVAILABLE_PRESETS = [
  { name: 'Dana', description: 'Executive Assistant, Stern & Direct' },
  { name: 'Carlos', description: 'Executive Assistant, Short & Professional' },
  { name: 'Yuki', description: 'Executive Assistant, Quick & Witty' },
  { name: 'Aria', description: 'Research Assistant, Thoughtful & Adaptive' },
] as const;
