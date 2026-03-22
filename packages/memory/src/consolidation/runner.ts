import type { DrizzleDB } from '../db.js';
import type { EmbeddingProvider } from '../embeddings/generator.js';
import type { BatchTrigger } from '@neo-agent/shared';
import { createBatchRun } from '../store/batch-runs.js';
import { replayEpisodes } from './stages/01-episodic-replay.js';
import { classifyItems } from './stages/02-para-classify.js';
import { integrateSemantics } from './stages/03-semantic-integrate.js';
import { synthesizeSkills } from './stages/04-skill-synthesize.js';
import { manageLifecycle } from './stages/05-lifecycle-manage.js';
import { recordCompletion, recordFailure } from './stages/06-record-keeping.js';

export type LlmCall = (prompt: string) => Promise<string>;

export interface PipelineConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  llmCall: LlmCall;
  triggerType: BatchTrigger;
  model?: string;
}

export interface PipelineResult {
  batchRunId: string;
  sessionsProcessed: number;
  factsCreated: number;
  factsUpdated: number;
  factsArchived: number;
  entitiesCreated: number;
  skillsCreated: number;
  duration: number;
}

export async function runPipeline(config: PipelineConfig): Promise<PipelineResult> {
  const { db, embeddingProvider, llmCall, triggerType } = config;
  const startTime = Date.now();

  // Create batch run record
  const batchRun = createBatchRun(db, triggerType, config.model ?? 'qwen3:8b');

  try {
    // Stage 1: Episodic Replay
    const { sessions, logIds } = replayEpisodes(db);

    if (sessions.length === 0) {
      recordCompletion(db, batchRun.id, [], {
        sessionsProcessed: 0,
        factsCreated: 0,
        factsUpdated: 0,
        factsArchived: 0,
        entitiesCreated: 0,
        skillsCreated: 0,
      });
      return {
        batchRunId: batchRun.id,
        sessionsProcessed: 0,
        factsCreated: 0,
        factsUpdated: 0,
        factsArchived: 0,
        entitiesCreated: 0,
        skillsCreated: 0,
        duration: Date.now() - startTime,
      };
    }

    // Stage 2: PARA Classification
    const classifiedItems = await classifyItems(db, llmCall, sessions);

    // Stage 3: Semantic Integration
    const integration = await integrateSemantics(db, embeddingProvider, llmCall, classifiedItems);

    // Stage 4: Skill Synthesis
    const skills = await synthesizeSkills(db, embeddingProvider, llmCall, sessions);

    // Stage 5: Lifecycle Management
    const lifecycle = await manageLifecycle(db);

    // Stage 6: Record Keeping
    const stats = {
      sessionsProcessed: sessions.length,
      factsCreated: integration.factsCreated.length,
      factsUpdated: integration.factsUpdated.length,
      factsArchived: lifecycle.archived,
      entitiesCreated: integration.entitiesCreated.length,
      skillsCreated: skills.length,
    };

    recordCompletion(db, batchRun.id, logIds, stats);

    return {
      batchRunId: batchRun.id,
      ...stats,
      duration: Date.now() - startTime,
    };
  } catch (err) {
    recordFailure(db, batchRun.id, err instanceof Error ? err.message : String(err));
    throw err;
  }
}
