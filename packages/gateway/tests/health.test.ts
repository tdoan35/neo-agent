import { describe, it, expect, afterEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import { startHealthServer, type HealthServer } from '../src/health.js';

let db: DrizzleDB;
let server: HealthServer | null = null;

afterEach(async () => {
  if (server) {
    await server.close();
    server = null;
  }
});

describe('Health server', () => {
  it('responds to /health with ok status', async () => {
    db = createDatabase(':memory:');
    // Use port 0 to get a random available port
    server = await startHealthServer(0, db, 'http://localhost:11434');

    const resp = await fetch(`http://localhost:${server.port}/health`);
    expect(resp.status).toBe(200);

    const data = await resp.json();
    expect(data.status).toBe('ok');
    expect(data.db).toBe('connected');
    expect(typeof data.uptime).toBe('number');
  });

  it('responds to /status with memory stats', async () => {
    db = createDatabase(':memory:');
    server = await startHealthServer(0, db, 'http://localhost:11434');

    const resp = await fetch(`http://localhost:${server.port}/status`);
    expect(resp.status).toBe(200);

    const data = await resp.json();
    expect(data.memoryStats).toBeDefined();
    expect(typeof data.memoryStats.facts).toBe('number');
    expect(typeof data.memoryStats.entities).toBe('number');
  });

  it('returns 404 for unknown routes', async () => {
    db = createDatabase(':memory:');
    server = await startHealthServer(0, db, 'http://localhost:11434');

    const resp = await fetch(`http://localhost:${server.port}/unknown`);
    expect(resp.status).toBe(404);
  });
});
