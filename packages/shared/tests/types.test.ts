import { describe, it, expect } from 'vitest';
import {
  VALID_TASK_TRANSITIONS,
  DECAY_RATES,
  DEFAULT_TOKEN_BUDGET,
  EMBEDDING_DIMENSIONS,
  MemoryError,
  NotFoundError,
  InvalidStateTransitionError,
  StoreError,
  EmbeddingError,
} from '@neo-agent/shared';
import type {
  ParaType,
  ContainerStatus,
  AccessScope,
  EntityType,
  FactType,
  TaskState,
  Container,
  Entity,
  Fact,
  WorkingMemoryTask,
  KanbanBoard,
} from '@neo-agent/shared';

describe('shared types', () => {
  it('ParaType accepts valid values', () => {
    const types: ParaType[] = ['project', 'area', 'resource', 'archive'];
    expect(types).toHaveLength(4);
  });

  it('ContainerStatus accepts valid values', () => {
    const statuses: ContainerStatus[] = ['active', 'paused', 'completed', 'archived'];
    expect(statuses).toHaveLength(4);
  });

  it('AccessScope accepts valid values', () => {
    const scopes: AccessScope[] = ['private', 'team', 'global'];
    expect(scopes).toHaveLength(3);
  });

  it('EntityType accepts valid values', () => {
    const types: EntityType[] = [
      'person', 'project', 'tool', 'service', 'concept',
      'codebase', 'organization', 'device', 'account',
      'language', 'framework',
    ];
    expect(types).toHaveLength(11);
  });

  it('FactType accepts valid values', () => {
    const types: FactType[] = [
      'preference', 'decision', 'convention', 'status',
      'capability', 'biographical', 'environmental',
      'observation', 'lesson_learned', 'goal', 'blocker',
    ];
    expect(types).toHaveLength(11);
  });

  it('TaskState accepts valid values', () => {
    const states: TaskState[] = ['backlog', 'active', 'blocked', 'done'];
    expect(states).toHaveLength(4);
  });
});

describe('constants', () => {
  it('VALID_TASK_TRANSITIONS defines correct transitions', () => {
    expect(VALID_TASK_TRANSITIONS.backlog).toEqual(['active']);
    expect(VALID_TASK_TRANSITIONS.active).toEqual(['blocked', 'done']);
    expect(VALID_TASK_TRANSITIONS.blocked).toEqual(['active']);
    expect(VALID_TASK_TRANSITIONS.done).toEqual([]);
  });

  it('DECAY_RATES has all expected keys', () => {
    expect(DECAY_RATES.area).toBe(0.01);
    expect(DECAY_RATES.project_active).toBe(0.03);
    expect(DECAY_RATES.project_done).toBe(0.10);
    expect(DECAY_RATES.resource).toBe(0.02);
    expect(DECAY_RATES.skill).toBe(0.005);
  });

  it('DEFAULT_TOKEN_BUDGET sums correctly', () => {
    const { total, workingMemory, userProfile, projectContext, relevantKnowledge, skills } = DEFAULT_TOKEN_BUDGET;
    expect(workingMemory + userProfile + projectContext + relevantKnowledge + skills).toBe(total);
  });

  it('EMBEDDING_DIMENSIONS is 768', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(768);
  });
});

describe('error classes', () => {
  it('MemoryError has code and name', () => {
    const err = new MemoryError('test error', 'TEST_CODE');
    expect(err.message).toBe('test error');
    expect(err.code).toBe('TEST_CODE');
    expect(err.name).toBe('MemoryError');
    expect(err).toBeInstanceOf(Error);
  });

  it('NotFoundError formats message correctly', () => {
    const err = new NotFoundError('Entity', 'abc-123');
    expect(err.message).toBe('Entity not found: abc-123');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('NotFoundError');
    expect(err).toBeInstanceOf(MemoryError);
  });

  it('InvalidStateTransitionError formats message correctly', () => {
    const err = new InvalidStateTransitionError('backlog', 'done');
    expect(err.message).toBe('Invalid state transition: backlog → done');
    expect(err.code).toBe('INVALID_TRANSITION');
    expect(err).toBeInstanceOf(MemoryError);
  });

  it('StoreError preserves cause', () => {
    const cause = new Error('underlying DB error');
    const err = new StoreError('failed to insert', cause);
    expect(err.message).toBe('failed to insert');
    expect(err.cause).toBe(cause);
    expect(err.code).toBe('STORE_ERROR');
  });

  it('EmbeddingError has correct code', () => {
    const err = new EmbeddingError('Ollama not running');
    expect(err.code).toBe('EMBEDDING_ERROR');
    expect(err).toBeInstanceOf(MemoryError);
  });
});

describe('domain object shapes', () => {
  it('Container interface matches expected structure', () => {
    const container: Container = {
      id: 'test-id',
      paraType: 'project',
      name: 'Test Project',
      description: 'A test project',
      outcome: 'Ship it',
      deadline: '2026-04-01',
      status: 'active',
      areaOfLife: null,
      parentId: null,
      scope: 'team',
      ownerAgent: null,
      archivedAt: null,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
    };
    expect(container.paraType).toBe('project');
    expect(container.status).toBe('active');
  });

  it('Fact interface composes base mixins', () => {
    const fact: Fact = {
      id: 'fact-1',
      entityId: 'entity-1',
      containerId: null,
      type: 'preference',
      content: 'Prefers pnpm over yarn',
      structured: { key: 'pkg_mgr', value: 'pnpm' },
      scope: 'global',
      projectId: null,
      ownerAgent: null,
      sourceSessionId: 'session-1',
      sourceType: 'stated',
      extractedBy: null,
      confidence: 1.0,
      decayRate: 0.02,
      lastConfirmedAt: null,
      lastAccessedAt: null,
      expiresAt: null,
      supersedesFactId: null,
      createdAt: '2026-03-21T00:00:00.000Z',
      updatedAt: '2026-03-21T00:00:00.000Z',
    };
    expect(fact.sourceType).toBe('stated');
    expect(fact.confidence).toBe(1.0);
  });

  it('KanbanBoard groups tasks by state', () => {
    const board: KanbanBoard = {
      active: [],
      blocked: [],
      backlog: [],
      done: [],
    };
    expect(Object.keys(board)).toEqual(['active', 'blocked', 'backlog', 'done']);
  });
});
