import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { DrizzleDB } from '@neo-agent/memory';
import type { EmbeddingProvider } from '@neo-agent/memory';

import { memoryRecallSchema, createRecallHandler } from './tools/memory-recall.js';
import { memoryStoreSchema, createStoreHandler } from './tools/memory-store.js';
import { memorySearchSchema, createSearchHandler } from './tools/memory-search.js';
import { memoryWorkingStateSchema, createWorkingStateHandler } from './tools/memory-working-state.js';
import { memoryHandoffSchema, createHandoffHandler } from './tools/memory-handoff.js';
import { memoryDreamSchema, createDreamHandler } from './tools/memory-dream.js';

export interface MemoryServerConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  agentId: string;
  projectId?: string;
}

export function createMemoryMcpServer(config: MemoryServerConfig): McpServer {
  const { db, embeddingProvider, agentId, projectId } = config;

  const server = new McpServer({
    name: 'neo-agent-memory',
    version: '0.1.0',
  });

  // memory_recall
  server.tool(
    'memory_recall',
    'Retrieve relevant context for the current situation',
    memoryRecallSchema,
    createRecallHandler(db, embeddingProvider, agentId, projectId),
  );

  // memory_store
  server.tool(
    'memory_store',
    'Explicitly save a fact, decision, or observation to the knowledge base',
    memoryStoreSchema,
    createStoreHandler(db, embeddingProvider, agentId, projectId),
  );

  // memory_search
  server.tool(
    'memory_search',
    'Search the knowledge base with semantic and/or keyword matching',
    memorySearchSchema,
    createSearchHandler(db, embeddingProvider, agentId, projectId),
  );

  // memory_working_state
  server.tool(
    'memory_working_state',
    'Get or update the current task kanban board',
    memoryWorkingStateSchema,
    createWorkingStateHandler(db, agentId, projectId),
  );

  // memory_handoff
  server.tool(
    'memory_handoff',
    'Capture end-of-session summary for cross-surface continuity',
    memoryHandoffSchema,
    createHandoffHandler(db, agentId, projectId),
  );

  // memory_dream
  server.tool(
    'memory_dream',
    'Trigger batch memory consolidation pipeline',
    memoryDreamSchema,
    createDreamHandler(db),
  );

  return server;
}
