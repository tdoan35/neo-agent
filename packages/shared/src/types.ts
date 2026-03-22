// ============================================================================
// PARA Types
// ============================================================================

export type ParaType = 'project' | 'area' | 'resource' | 'archive';
export type ContainerStatus = 'active' | 'paused' | 'completed' | 'archived';

// ============================================================================
// Brain Types
// ============================================================================

export type BrainType = 'episodic' | 'semantic' | 'procedural' | 'prospective';

// ============================================================================
// Scope Types
// ============================================================================

export type AccessScope = 'private' | 'team' | 'global';

// ============================================================================
// Entity Types
// ============================================================================

export type EntityType =
  | 'person'
  | 'project'
  | 'tool'
  | 'service'
  | 'concept'
  | 'codebase'
  | 'organization'
  | 'device'
  | 'account'
  | 'language'
  | 'framework';

// ============================================================================
// Fact Types
// ============================================================================

export type FactType =
  | 'preference'
  | 'decision'
  | 'convention'
  | 'status'
  | 'capability'
  | 'biographical'
  | 'environmental'
  | 'observation'
  | 'lesson_learned'
  | 'goal'
  | 'blocker';

export type SourceType = 'stated' | 'extracted' | 'inferred' | 'promoted';

// ============================================================================
// Relation Types
// ============================================================================

export type RelationType =
  | 'works_on'
  | 'uses'
  | 'owns'
  | 'created_by'
  | 'depends_on'
  | 'replaces'
  | 'related_to'
  | 'part_of'
  | 'collaborates_with'
  | 'deployed_on'
  | 'integrates_with';

// ============================================================================
// Working Memory
// ============================================================================

export type TaskState = 'backlog' | 'active' | 'blocked' | 'done';

// ============================================================================
// Session
// ============================================================================

export type Surface = 'tui' | 'web' | 'telegram' | 'discord';
export type TurnRole = 'user' | 'assistant' | 'tool';

// ============================================================================
// Batch Processing
// ============================================================================

export type BatchTrigger = 'cron' | 'session_count' | 'manual';
export type BatchStatus = 'running' | 'completed' | 'failed';

// ============================================================================
// Retrieval
// ============================================================================

export type RetrievalMode = 'SessionStart' | 'PostCompact' | 'PerPrompt' | 'Heartbeat';
export type EmbeddingSource = 'fact' | 'entity' | 'skill' | 'session_chunk';

// ============================================================================
// Base Interfaces (Mixins)
// ============================================================================

export interface Timestamped {
  createdAt: string;
  updatedAt: string;
}

export interface Scoped {
  scope: AccessScope;
  projectId: string | null;
  ownerAgent: string | null;
}

export interface WithProvenance {
  sourceSessionId: string | null;
  sourceType: SourceType;
  extractedBy: string | null;
}

export interface WithConfidence {
  confidence: number;
}

export interface WithDecay extends WithConfidence {
  decayRate: number;
  lastConfirmedAt: string | null;
  lastAccessedAt: string | null;
}

// ============================================================================
// Domain Object Interfaces
// ============================================================================

export interface Container extends Timestamped {
  id: string;
  paraType: ParaType;
  name: string;
  description: string | null;
  outcome: string | null;
  deadline: string | null;
  status: ContainerStatus;
  areaOfLife: string | null;
  parentId: string | null;
  scope: AccessScope;
  ownerAgent: string | null;
  archivedAt: string | null;
}

export interface Entity extends Timestamped, Scoped, WithConfidence {
  id: string;
  type: EntityType;
  name: string;
  aliases: string[];
  description: string | null;
  containerId: string | null;
  sourceSessionId: string | null;
  lastAccessedAt: string | null;
}

export interface Fact extends Timestamped, Scoped, WithProvenance, WithDecay {
  id: string;
  entityId: string | null;
  containerId: string | null;
  type: FactType;
  content: string;
  structured: Record<string, unknown> | null;
  expiresAt: string | null;
  supersedesFactId: string | null;
}

export interface Relation extends Timestamped, WithConfidence {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: RelationType;
  label: string | null;
  directional: boolean;
  scope: AccessScope;
  projectId: string | null;
}

export interface EntityContainerLink {
  id: string;
  entityId: string;
  containerId: string;
  role: string | null;
  addedAt: string;
}

export interface WorkingMemoryTask extends Timestamped, Scoped {
  id: string;
  agentId: string;
  title: string;
  state: TaskState;
  context: Record<string, unknown> | null;
  decisions: Array<{ content: string; timestamp: string }>;
  blockers: string | null;
  openQuestions: string[];
  handoffSummary: string | null;
  completedAt: string | null;
}

export interface SessionLogEntry {
  id: string;
  sessionId: string;
  agentId: string;
  projectId: string | null;
  surface: Surface | null;
  turnIndex: number;
  role: TurnRole;
  content: string;
  toolName: string | null;
  toolInput: Record<string, unknown> | null;
  model: string | null;
  tokenCount: number | null;
  createdAt: string;
  processed: boolean;
  processedAt: string | null;
  batchRunId: string | null;
}

export interface Skill extends Timestamped, WithConfidence {
  id: string;
  name: string;
  description: string | null;
  filePath: string;
  category: string | null;
  tags: string[];
  relatedEntityIds: string[];
  timesUsed: number;
  lastUsedAt: string | null;
  successRate: number | null;
  scope: AccessScope;
  projectId: string | null;
  synthesizedFrom: string[] | null;
}

export interface EmbeddingRecord {
  id: string;
  sourceType: EmbeddingSource;
  sourceId: string;
  textContent: string;
  createdAt: string;
}

export interface AgentIdentity extends Timestamped {
  id: string;
  name: string;
  role: string;
  tone: string;
  avatar: { color: string; letter: string };
  persona: string;
  boundaries: string[];
  soulPath: string;
  isPreset: boolean;
  createdFrom: string | null;
}

export interface BatchRun {
  id: string;
  triggerType: BatchTrigger;
  status: BatchStatus;
  sessionsProcessed: number;
  factsCreated: number;
  factsUpdated: number;
  factsArchived: number;
  entitiesCreated: number;
  skillsCreated: number;
  model: string;
  startedAt: string;
  completedAt: string | null;
  error: string | null;
}

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  agentId: string;
  deliverTo: string;
  enabled: boolean;
  lastRunAt: string | null;
  nextRunAt: string;
  createdAt: string;
}

// ============================================================================
// Kanban Board (Aggregate)
// ============================================================================

export interface KanbanBoard {
  active: WorkingMemoryTask[];
  blocked: WorkingMemoryTask[];
  backlog: WorkingMemoryTask[];
  done: WorkingMemoryTask[];
}
