import type { DrizzleDB } from '../../db.js';
import type { EmbeddingProvider } from '../../embeddings/generator.js';
import type { Skill } from '@neo-agent/shared';
import { createSkill } from '../../store/skills.js';
import { storeEmbedding } from '../../embeddings/index.js';
import { getBoard } from '../../working-memory/index.js';
import { buildSkillSynthesisPrompt, formatSkillMarkdown } from '../prompts/skill-synthesis.js';
import type { SessionSummary } from './01-episodic-replay.js';
import type { LlmCall } from '../runner.js';

export interface SynthesizedSkill extends Skill {
  synthesizedFrom: string[];
}

function isSkillWorthy(session: SessionSummary, db: DrizzleDB): boolean {
  // Heuristic: at least 3 distinct tool calls and 5+ turns
  if (session.toolsUsed.length < 3) return false;
  if (session.turns.length < 5) return false;

  // Check if a task moved to done during this session
  const board = getBoard(db, session.agentId, session.projectId ?? undefined);
  return board.done.length > 0;
}

function slugify(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

export async function synthesizeSkills(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  llmCall: LlmCall,
  sessions: SessionSummary[],
): Promise<SynthesizedSkill[]> {
  const results: SynthesizedSkill[] = [];

  for (const session of sessions) {
    if (!isSkillWorthy(session, db)) continue;

    // Get the done task title
    const board = getBoard(db, session.agentId, session.projectId ?? undefined);
    const doneTask = board.done[0];
    const taskTitle = doneTask?.title ?? 'Completed task';

    // Build session content for context
    const sessionContent = session.turns.map(t =>
      `[${t.role}${t.toolName ? ` (${t.toolName})` : ''}]: ${t.content.slice(0, 200)}`
    ).join('\n');

    const prompt = buildSkillSynthesisPrompt(taskTitle, session.toolsUsed, sessionContent);

    try {
      const response = await llmCall(prompt);
      const match = response.match(/\{[\s\S]*\}/);
      if (!match) continue;

      const parsed = JSON.parse(match[0]) as {
        name?: string;
        description?: string;
        steps?: string[];
        tools?: string[];
        category?: string;
        tags?: string[];
      };

      if (!parsed.name || !parsed.description) continue;

      const slug = slugify(parsed.name);
      const filePath = `~/.agent/skills/${slug}.md`;
      const content = formatSkillMarkdown({
        name: parsed.name,
        description: parsed.description,
        steps: parsed.steps ?? [],
        tools: parsed.tools ?? [],
        tags: parsed.tags ?? [],
      });

      // Create skill record
      const skill = createSkill(db, {
        name: parsed.name,
        description: parsed.description,
        filePath,
        category: parsed.category ?? 'workflow',
        tags: parsed.tags ?? [],
        scope: 'private',
        synthesizedFrom: [session.sessionId],
      });

      // Store embedding
      try {
        const vec = await provider.embed(`${parsed.name}: ${parsed.description}`);
        storeEmbedding(db, { sourceType: 'skill', sourceId: skill.id, textContent: parsed.description, vector: vec });
      } catch { /* non-critical */ }

      results.push({
        ...skill,
        synthesizedFrom: [session.sessionId],
      });
    } catch {
      continue;
    }
  }

  return results;
}
