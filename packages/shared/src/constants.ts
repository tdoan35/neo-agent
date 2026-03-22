import type { TaskState } from './types.js';

export const VALID_TASK_TRANSITIONS: Record<TaskState, TaskState[]> = {
  backlog: ['active'],
  active: ['blocked', 'done'],
  blocked: ['active'],
  done: [],
};

export const DECAY_RATES = {
  area: 0.01,
  project_active: 0.03,
  project_done: 0.10,
  resource: 0.02,
  skill: 0.005,
} as const;

export const DEFAULT_TOKEN_BUDGET = {
  total: 2000,
  workingMemory: 500,
  userProfile: 300,
  projectContext: 400,
  relevantKnowledge: 600,
  skills: 200,
} as const;

export const EMBEDDING_DIMENSIONS = 768;
