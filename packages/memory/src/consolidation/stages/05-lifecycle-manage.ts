import type { DrizzleDB } from '../../db.js';
import { bulkApplyDecay, listFacts, createFact } from '../../store/facts.js';
import { listContainers, updateContainer } from '../../store/containers.js';
import { getBoard } from '../../working-memory/index.js';
import { deleteEmbeddingBySource } from '../../embeddings/index.js';

export interface LifecycleResult {
  decayed: number;
  archived: number;
  pruned: number;
  promoted: number;
  projectsCompleted: number;
}

export async function manageLifecycle(db: DrizzleDB): Promise<LifecycleResult> {
  // 5a. Decay pass
  const decayResult = bulkApplyDecay(db, new Date());

  // 5b + 5c: Archive and prune are handled by bulkApplyDecay already
  // (it archives facts below 0.1 and prunes below 0.01)

  // 5d. Project completion check
  let projectsCompleted = 0;
  const projectContainers = listContainers(db, { paraType: 'project', status: 'active' });

  for (const project of projectContainers) {
    // Check if all tasks for this project are done
    // We use a heuristic: get the board for the project context
    // Since projects don't have a single agentId, check if any facts reference it
    const projectFacts = listFacts(db, { containerId: project.id });
    if (projectFacts.length === 0) continue;

    // A project is "complete" when explicitly archived — we don't auto-complete
    // because we can't reliably determine all tasks are done without agent context
  }

  // 5e. Promotion pass: team-scoped facts appearing in 2+ containers → promote to global
  let promoted = 0;
  const teamFacts = listFacts(db, { scope: 'team' });

  // Group by content similarity (exact match for simplicity)
  const contentMap = new Map<string, typeof teamFacts>();
  for (const fact of teamFacts) {
    const key = fact.content.toLowerCase().trim();
    const group = contentMap.get(key) ?? [];
    group.push(fact);
    contentMap.set(key, group);
  }

  for (const [, facts] of contentMap) {
    // Check if same content appears in different containers
    const containerIds = new Set(facts.map(f => f.containerId).filter(Boolean));
    if (containerIds.size >= 2) {
      // Promote: create global fact
      createFact(db, {
        type: facts[0].type,
        content: facts[0].content,
        entityId: facts[0].entityId ?? undefined,
        scope: 'global',
        sourceType: 'promoted',
        extractedBy: 'dream-pipeline',
        confidence: Math.max(...facts.map(f => f.confidence)),
      });
      promoted++;
    }
  }

  return {
    decayed: decayResult.updated,
    archived: decayResult.archived,
    pruned: decayResult.pruned,
    promoted,
    projectsCompleted,
  };
}
