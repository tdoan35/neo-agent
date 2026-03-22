# Phase 7: Multi-Agent

## Overview

Support multiple agents with different identities, models, tools, and scopes — coordinated via a shared task queue and routing layer. Each agent is the same struct with different config. The memory layer's scoping system (private/team/global) enables knowledge isolation and sharing between agents.

**Estimated effort**: 4-6 weeks

---

## Prerequisites

- Phases 1-5 complete (memory layer with scoping, both agent paths, gateway)
- Agent identity system functional (SOUL.md + identities table)
- Working memory kanban with scope support

---

## 7.1 Agent Registry

### Key Interface

```typescript
interface AgentRegistryEntry {
  id: string;
  name: string;
  identity: AgentIdentity;
  modelConfig: {
    primaryTier: ModelTier;
    sdkPath: 'agent-sdk' | 'vercel-ai';   // Which SDK this agent uses
  };
  tools: string[];                        // Enabled tool names
  mcpServers: string[];                   // Connected MCP servers
  knowledge: {
    workingMemory: boolean;
    knowledgeBase: boolean;
    dreamProcessing: boolean;
    skillLearning: boolean;
    scope: { tier: AccessScope; containers: string[] };
  };
  status: 'active' | 'inactive' | 'archived';
}

interface AgentRegistry {
  register(config: AgentRegistryEntry): Promise<void>;
  get(id: string): Promise<AgentRegistryEntry | null>;
  getByName(name: string): Promise<AgentRegistryEntry | null>;
  list(status?: 'active' | 'inactive'): Promise<AgentRegistryEntry[]>;
  update(id: string, updates: Partial<AgentRegistryEntry>): Promise<void>;
  deactivate(id: string): Promise<void>;
}
```

### Implementation Notes

- Agent configs stored in `~/.agent/agents/{name}.config.json` (file-based, version-controllable)
- Registry indexes configs in SQLite for fast lookup
- Each agent definition maps to either an Agent SDK `query()` call or a Vercel AI SDK agent loop
- `sdkPath` determines which integration path handles this agent:
  - `'agent-sdk'`: Full Agent SDK with hooks (Claude models)
  - `'vercel-ai'`: Vercel AI SDK with middleware (GLM, Ollama, OpenRouter)

---

## 7.2 Router / Supervisor

### Key Interface

```typescript
interface RoutingDecision {
  agentId: string;
  agentName: string;
  confidence: number;
  reason: string;
}

interface Router {
  route(prompt: string, context: RoutingContext): Promise<RoutingDecision>;
}

interface RoutingContext {
  activeProject?: string;
  currentAgent?: string;
  workingMemory?: KanbanBoard;
}
```

### Routing Strategy

**Layer 1: Rule-based (fast, deterministic)**
- Explicit commands: `/agent switch aria` → route to Aria
- Project context: if prompt mentions a project name → route to that project's default agent
- Tool keywords: if prompt mentions coding → route to coding-capable agent
- Fallback: route to the user's default agent

**Layer 2: LLM-based (for ambiguous cases)**
- When rule-based routing has low confidence (<0.6)
- Call cheap local model with:

```
Available agents:
${agentList with descriptions}

User prompt: "${prompt}"
Current context: ${activeProject}, ${currentTask}

Which agent should handle this? Return: { agentId, reason }
```

### Implementation Notes

- Router runs before every prompt (fast path: ~1ms for rule-based)
- LLM routing is rare (most prompts match rules)
- Router does NOT start a new session — it selects the agent identity, then the existing session continues with the new agent's context
- Agent swap preserves working memory (kanban carries over)

---

## 7.3 Team-Scoped Kanban

### Key Interface

```typescript
// Extends existing working memory with team visibility

function getTeamBoard(
  db: DrizzleDB,
  projectId: string
): Promise<KanbanBoard>
// Returns all tasks for a project, regardless of which agent created them

function assignTask(
  db: DrizzleDB,
  taskId: string,
  agentId: string
): Promise<WorkingMemoryTask>
// Assigns (or reassigns) a task to a specific agent
```

### Implementation Notes

- Team-scoped tasks (`scope: 'team'`) are visible to all agents on the project
- Private-scoped tasks (`scope: 'private'`) remain visible only to the owning agent
- Agent A creates a team task → Agent B sees it in their board
- Task assignment: when Router decides a different agent should handle a task, it reassigns via `assignTask`
- Blocked tasks with reasons help the Router: if Agent A is blocked on something Agent B can handle, route to B

### Cross-Agent Task Flow

```
User → Router → Agent A starts task
Agent A blocks → Router sees blocker
User sends related prompt → Router routes to Agent B
Agent B resolves blocker → Router routes back to Agent A
Agent A completes task
```

---

## 7.4 Task Queue + Message Bus

### Key Interface

```typescript
interface TaskMessage {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  type: 'delegate' | 'result' | 'status_update' | 'request_info';
  payload: {
    taskId?: string;
    content: string;
    context?: Record<string, unknown>;
  };
  createdAt: string;
  processedAt: string | null;
}

interface MessageBus {
  send(message: Omit<TaskMessage, 'id' | 'createdAt' | 'processedAt'>): Promise<TaskMessage>;
  receive(agentId: string): Promise<TaskMessage[]>;  // Unprocessed messages for this agent
  acknowledge(messageId: string): Promise<void>;
}
```

### Implementation Notes

- **No direct agent-to-agent conversation** — tasks are the communication primitive
- Messages stored in a `task_messages` SQLite table (new schema addition)
- Agent A delegates to Agent B:
  1. A sends a `delegate` message with task context
  2. Router picks it up on next prompt cycle
  3. B receives the context via its working memory injection
  4. B works on the task, sends `result` message when done
  5. A receives the result in its next session

- **Async by design**: Agents don't wait for each other. The message bus is polled on session start and heartbeat.

### Message Bus Schema Addition

```
task_messages table:
  id, from_agent_id, to_agent_id, type, payload (JSON), created_at, processed_at
```

---

## 7.5 Multi-Agent Session Management

### Key Interface

```typescript
interface MultiAgentSession {
  activeAgentId: string;
  agentSessions: Map<string, AgentSession>;  // One session per agent
  sharedMemory: DrizzleDB;                   // Same DB
  router: Router;
}
```

### Implementation Notes

- Each agent has its own conversation history (separate Agent SDK session or Vercel AI message array)
- Working memory is shared (team-scoped tasks)
- Knowledge base is shared (team + global facts)
- Private scratchpad is isolated (private-scoped facts)
- Agent swap is lightweight: save current agent's state, load new agent's state, continue with shared working memory

---

## Acceptance Criteria

- [ ] Agent registry stores and retrieves multiple agent configs
- [ ] Agents can use different SDK paths (Agent SDK vs Vercel AI SDK)
- [ ] Router classifies prompts and routes to appropriate agent
- [ ] Rule-based routing works for explicit commands and project context
- [ ] LLM-based routing activates for ambiguous cases
- [ ] Agent swap preserves working memory (kanban carries over)
- [ ] Team-scoped tasks visible to all agents on a project
- [ ] Task assignment works (reassign task between agents)
- [ ] Message bus delivers delegate/result messages between agents
- [ ] Private working memory isolated per agent
- [ ] Global and team knowledge shared across agents

---

## Known Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Router overhead on every prompt | Rule-based layer is ~1ms. LLM routing only for ambiguous cases (<10% of prompts). Cache routing decisions for similar prompts |
| Multi-agent coordination complexity | Start with 2 agents (executive assistant + coding partner). Add more as patterns emerge |
| Shared working memory conflicts (two agents modify same task) | SQLite serializes writes. Last-write-wins for task updates. Log conflicts for review |
| Message bus latency (async task delegation) | Messages polled on session start and heartbeat (10min). For urgent tasks, consider push notification via gateway |
| Agent SDK session management for multiple agents | Each agent has its own `query()` call. Sessions are independent. Only working memory is shared |
