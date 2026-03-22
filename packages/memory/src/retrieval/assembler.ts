import type { DrizzleDB } from '../db.js';
import type { EmbeddingProvider } from '../embeddings/generator.js';
import type { RetrievalMode, Fact, AccessScope } from '@neo-agent/shared';
import { DEFAULT_TOKEN_BUDGET } from '@neo-agent/shared';
import { getBoard, formatForInjection } from '../working-memory/index.js';
import { listFacts, touchFact } from '../store/facts.js';
import { listContainers } from '../store/containers.js';
import { listSkills } from '../store/skills.js';
import { semanticSearch } from './semantic.js';

export interface AssembledContext {
  workingMemory: string;
  userProfile: string;
  projectContext: string;
  relevantKnowledge: string;
  availableSkills: string;
  totalTokenEstimate: number;
}

export interface TokenBudget {
  total: number;
  workingMemory: number;
  userProfile: number;
  projectContext: number;
  relevantKnowledge: number;
  skills: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '\n...';
}

export async function assembleBlocks(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  projectId: string | null,
  prompt: string,
  options?: {
    mode?: RetrievalMode;
    budget?: Partial<TokenBudget>;
  },
): Promise<AssembledContext> {
  const mode = options?.mode ?? 'PerPrompt';
  const budget: TokenBudget = { ...DEFAULT_TOKEN_BUDGET, ...options?.budget };
  let totalTokens = 0;

  const result: AssembledContext = {
    workingMemory: '',
    userProfile: '',
    projectContext: '',
    relevantKnowledge: '',
    availableSkills: '',
    totalTokenEstimate: 0,
  };

  // Block 1: Working Memory (SessionStart, PostCompact, Heartbeat)
  if (mode === 'SessionStart' || mode === 'PostCompact' || mode === 'Heartbeat') {
    const board = getBoard(db, agentId, projectId ?? undefined);
    result.workingMemory = truncateToTokens(formatForInjection(board, budget.workingMemory), budget.workingMemory);
    totalTokens += estimateTokens(result.workingMemory);
  }

  // Heartbeat mode only needs working memory
  if (mode === 'Heartbeat') {
    result.totalTokenEstimate = totalTokens;
    return result;
  }

  // Block 2: User Profile (SessionStart, PostCompact)
  if (mode === 'SessionStart' || mode === 'PostCompact') {
    const profileFacts = listFacts(db, { scope: 'global', type: 'biographical' });
    const prefFacts = listFacts(db, { scope: 'global', type: 'preference' });
    const allProfile = [...profileFacts, ...prefFacts]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 10);

    if (allProfile.length > 0) {
      const lines = ['## About the User', ''];
      for (const fact of allProfile) {
        lines.push(`- ${fact.content}`);
      }
      result.userProfile = truncateToTokens(lines.join('\n'), budget.userProfile);
      totalTokens += estimateTokens(result.userProfile);
    }
  }

  // Block 3: Project Context (SessionStart, PostCompact — only if projectId)
  if ((mode === 'SessionStart' || mode === 'PostCompact') && projectId) {
    const containers = listContainers(db, { status: 'active' });
    const projectContainer = containers.find(c => c.id === projectId);

    if (projectContainer) {
      const projectFacts = listFacts(db, { containerId: projectId, type: 'decision' });
      const conventionFacts = listFacts(db, { containerId: projectId, type: 'convention' });

      const lines = [`## Current Project: ${projectContainer.name}`, ''];
      if (projectContainer.description) lines.push(projectContainer.description, '');
      if (projectContainer.outcome) lines.push(`**Outcome:** ${projectContainer.outcome}`, '');

      if (projectFacts.length > 0 || conventionFacts.length > 0) {
        lines.push('### Key Decisions & Conventions', '');
        for (const f of [...projectFacts, ...conventionFacts].slice(0, 5)) {
          lines.push(`- ${f.content}`);
        }
      }

      result.projectContext = truncateToTokens(lines.join('\n'), budget.projectContext);
      totalTokens += estimateTokens(result.projectContext);
    }
  }

  // Block 4: Relevant Knowledge (all modes except Heartbeat)
  if (prompt) {
    const remainingBudget = Math.max(100, budget.total - totalTokens - budget.skills);

    const searchResults = await semanticSearch(db, provider, prompt, {
      limit: 20,
      finalLimit: 10,
      scope: { agentId, projectId: projectId ?? undefined },
    });

    if (searchResults.length > 0) {
      const lines = ['## Relevant Knowledge', ''];
      for (const r of searchResults) {
        const line = `- ${r.content} (${r.sourceType}, confidence: ${r.confidence.toFixed(2)})`;
        if (estimateTokens(lines.join('\n') + '\n' + line) > remainingBudget) break;
        lines.push(line);

        // Reinforcement: touch facts that get injected
        if (r.sourceType === 'fact') {
          try { touchFact(db, r.sourceId); } catch { /* ignore if deleted */ }
        }
      }
      result.relevantKnowledge = lines.join('\n');
      totalTokens += estimateTokens(result.relevantKnowledge);
    }
  }

  // Block 5: Available Skills (all modes except Heartbeat)
  if (prompt) {
    const skillResults = await semanticSearch(db, provider, prompt, {
      limit: 5,
      finalLimit: 3,
      sourceTypes: ['skill'],
      scope: { agentId, projectId: projectId ?? undefined },
    });

    if (skillResults.length > 0) {
      const lines = ['## Available Procedures', ''];
      for (const r of skillResults) {
        lines.push(`- **${r.content.split('\n')[0]}** (used ${r.recencyDays.toFixed(0)} days ago)`);
      }
      result.availableSkills = truncateToTokens(lines.join('\n'), budget.skills);
      totalTokens += estimateTokens(result.availableSkills);
    }
  }

  result.totalTokenEstimate = totalTokens;
  return result;
}

export async function assembleContext(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  agentId: string,
  projectId: string | null,
  prompt: string,
  options?: {
    mode?: RetrievalMode;
    budget?: Partial<TokenBudget>;
  },
): Promise<string> {
  const blocks = await assembleBlocks(db, provider, agentId, projectId, prompt, options);

  const sections = [
    blocks.workingMemory,
    blocks.userProfile,
    blocks.projectContext,
    blocks.relevantKnowledge,
    blocks.availableSkills,
  ].filter(s => s.length > 0);

  return sections.join('\n\n');
}
