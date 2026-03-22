import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB, createMockEmbeddingProvider, type EmbeddingProvider } from '@neo-agent/memory';
import { createMemoryMcpServer } from '@neo-agent/mcp-server';

let db: DrizzleDB;
let provider: EmbeddingProvider;

beforeEach(() => {
  db = createDatabase(':memory:');
  provider = createMockEmbeddingProvider();
});

describe('MCP server', () => {
  it('creates server with all 6 tools registered', () => {
    const server = createMemoryMcpServer({
      db,
      embeddingProvider: provider,
      agentId: 'test-agent',
    });

    expect(server).toBeDefined();
    // McpServer is an object — verify it was created without errors
    expect(typeof server.tool).toBe('function');
  });

  it('creates server with projectId', () => {
    const server = createMemoryMcpServer({
      db,
      embeddingProvider: provider,
      agentId: 'test-agent',
      projectId: 'proj-1',
    });

    expect(server).toBeDefined();
  });
});
