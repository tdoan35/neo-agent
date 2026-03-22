import type { DrizzleDB } from '../../db.js';
import type { FactType, EntityType, ParaType } from '@neo-agent/shared';
import { listContainers, createContainer } from '../../store/containers.js';
import { buildClassificationPrompt } from '../prompts/classification.js';
import type { SessionSummary } from './01-episodic-replay.js';
import type { LlmCall } from '../runner.js';

export interface ClassifiedItem {
  content: string;
  type: FactType;
  containerId: string;
  containerName: string;
  isNewContainer: boolean;
  entityName?: string;
  entityType?: EntityType;
  confidence: number;
}

interface RawClassifiedItem {
  content: string;
  type: string;
  containerName: string;
  entityName?: string;
  entityType?: string;
  confidence?: number;
}

function inferParaType(name: string): ParaType {
  const lower = name.toLowerCase();
  if (lower.includes('project') || lower.includes('deadline') || lower.includes('sprint')) return 'project';
  if (lower.includes('reference') || lower.includes('guide') || lower.includes('docs')) return 'resource';
  return 'area'; // Default
}

const VALID_FACT_TYPES = new Set([
  'preference', 'decision', 'convention', 'status', 'capability',
  'biographical', 'environmental', 'observation', 'lesson_learned',
]);

export async function classifyItems(
  db: DrizzleDB,
  llmCall: LlmCall,
  sessions: SessionSummary[],
): Promise<ClassifiedItem[]> {
  if (sessions.length === 0) return [];

  const existingContainers = listContainers(db);
  const containerByName = new Map(existingContainers.map(c => [c.name.toLowerCase(), c]));

  const results: ClassifiedItem[] = [];

  // Process sessions in batches of 5
  for (let i = 0; i < sessions.length; i += 5) {
    const batch = sessions.slice(i, i + 5);
    const prompt = buildClassificationPrompt(batch, existingContainers);

    let rawItems: RawClassifiedItem[];
    try {
      const response = await llmCall(prompt);
      const match = response.match(/\[[\s\S]*\]/);
      if (!match) continue;
      rawItems = JSON.parse(match[0]);
      if (!Array.isArray(rawItems)) continue;
    } catch {
      continue;
    }

    for (const item of rawItems) {
      if (!item.content || typeof item.content !== 'string') continue;
      if (!VALID_FACT_TYPES.has(item.type)) continue;

      // Resolve container
      let containerId: string;
      let isNewContainer = false;
      const existing = containerByName.get((item.containerName ?? '').toLowerCase());

      if (existing) {
        containerId = existing.id;
      } else if (item.containerName) {
        const container = createContainer(db, {
          paraType: inferParaType(item.containerName),
          name: item.containerName,
          status: 'active',
          scope: 'private',
        });
        containerId = container.id;
        containerByName.set(container.name.toLowerCase(), container);
        isNewContainer = true;
      } else {
        // No container specified — use or create default
        let defaultContainer = containerByName.get('general');
        if (!defaultContainer) {
          defaultContainer = createContainer(db, {
            paraType: 'area',
            name: 'General',
            status: 'active',
            scope: 'global',
          });
          containerByName.set('general', defaultContainer);
        }
        containerId = defaultContainer.id;
        isNewContainer = false;
      }

      results.push({
        content: item.content,
        type: item.type as FactType,
        containerId,
        containerName: item.containerName ?? 'General',
        isNewContainer,
        entityName: item.entityName,
        entityType: item.entityType as EntityType | undefined,
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
      });
    }
  }

  return results;
}
