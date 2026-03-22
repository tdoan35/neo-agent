import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB } from '@neo-agent/memory';
import { randomUUID } from 'node:crypto';

let db: DrizzleDB;

beforeEach(() => {
  db = createDatabase(':memory:');
});

describe('database initialization', () => {
  it('creates database without errors', () => {
    expect(db).toBeDefined();
  });

  it('all 12 tables exist', () => {
    const tables = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%' ORDER BY name")
      .all() as Array<{ name: string }>;

    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('containers');
    expect(tableNames).toContain('entities');
    expect(tableNames).toContain('facts');
    expect(tableNames).toContain('relations');
    expect(tableNames).toContain('entity_containers');
    expect(tableNames).toContain('working_memory');
    expect(tableNames).toContain('session_logs');
    expect(tableNames).toContain('skills');
    expect(tableNames).toContain('embeddings');
    expect(tableNames).toContain('identities');
    expect(tableNames).toContain('batch_runs');
    expect(tableNames).toContain('cron_jobs');
  });
});

describe('containers table', () => {
  it('inserts and reads a container', () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO containers (id, para_type, name, status, scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'project', 'Test Project', 'active', 'team', now, now);

    const row = db.$client.prepare('SELECT * FROM containers WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.para_type).toBe('project');
    expect(row.name).toBe('Test Project');
    expect(row.status).toBe('active');
    expect(row.scope).toBe('team');
  });

  it('supports nullable fields', () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO containers (id, para_type, name, status, scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'area', 'Career', 'active', 'global', now, now);

    const row = db.$client.prepare('SELECT * FROM containers WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.description).toBeNull();
    expect(row.outcome).toBeNull();
    expect(row.deadline).toBeNull();
    expect(row.parent_id).toBeNull();
    expect(row.archived_at).toBeNull();
  });
});

describe('entities table', () => {
  it('stores JSON aliases', () => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const aliases = JSON.stringify(['Alice', 'the frontend lead']);

    db.$client.prepare(`
      INSERT INTO entities (id, type, name, aliases, scope, created_at, updated_at, confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'person', 'Alice Chen', aliases, 'global', now, now, 1.0);

    const row = db.$client.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Record<string, unknown>;
    const parsed = JSON.parse(row.aliases as string) as string[];
    expect(parsed).toEqual(['Alice', 'the frontend lead']);
  });
});

describe('facts table', () => {
  it('stores fact with confidence and decay', () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO facts (id, type, content, scope, source_type, created_at, updated_at, confidence, decay_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'preference', 'Prefers pnpm over yarn', 'global', 'stated', now, now, 1.0, 0.02);

    const row = db.$client.prepare('SELECT * FROM facts WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.confidence).toBe(1.0);
    expect(row.decay_rate).toBe(0.02);
    expect(row.source_type).toBe('stated');
  });

  it('supports supersession chain', () => {
    const oldId = randomUUID();
    const newId = randomUUID();
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO facts (id, type, content, scope, source_type, created_at, updated_at, confidence, decay_rate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(oldId, 'preference', 'Uses npm', 'global', 'stated', now, now, 0.5, 0.02);

    db.$client.prepare(`
      INSERT INTO facts (id, type, content, scope, source_type, created_at, updated_at, confidence, decay_rate, supersedes_fact_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(newId, 'preference', 'Uses pnpm', 'global', 'stated', now, now, 1.0, 0.02, oldId);

    const newRow = db.$client.prepare('SELECT * FROM facts WHERE id = ?').get(newId) as Record<string, unknown>;
    expect(newRow.supersedes_fact_id).toBe(oldId);
  });
});

describe('working_memory table', () => {
  it('stores task with JSON decisions and open questions', () => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const decisions = JSON.stringify([{ content: 'Use JWT', timestamp: now }]);
    const questions = JSON.stringify(['Should we use refresh tokens?']);

    db.$client.prepare(`
      INSERT INTO working_memory (id, agent_id, title, state, decisions, open_questions, scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'agent-1', 'Fix auth bug', 'active', decisions, questions, 'private', now, now);

    const row = db.$client.prepare('SELECT * FROM working_memory WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.state).toBe('active');
    expect(JSON.parse(row.decisions as string)).toHaveLength(1);
    expect(JSON.parse(row.open_questions as string)).toEqual(['Should we use refresh tokens?']);
  });
});

describe('FTS5 full-text search', () => {
  it('FTS5 virtual table exists', () => {
    const tables = db.$client
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = 'session_logs_fts'")
      .all() as Array<{ name: string }>;
    expect(tables).toHaveLength(1);
  });

  it('indexes and searches session log content', () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO session_logs (id, session_id, agent_id, turn_index, role, content, created_at, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'sess-1', 'agent-1', 0, 'user', 'Can you review the authentication module?', now, 0);

    const results = db.$client.prepare(`
      SELECT sl.id, sl.content FROM session_logs_fts fts
      JOIN session_logs sl ON sl.rowid = fts.rowid
      WHERE session_logs_fts MATCH 'authentication'
    `).all() as Array<{ id: string; content: string }>;

    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('authentication');
  });

  it('does not match unrelated content', () => {
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO session_logs (id, session_id, agent_id, turn_index, role, content, created_at, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), 'sess-1', 'agent-1', 0, 'user', 'Hello world', now, 0);

    const results = db.$client.prepare(`
      SELECT sl.id FROM session_logs_fts fts
      JOIN session_logs sl ON sl.rowid = fts.rowid
      WHERE session_logs_fts MATCH 'authentication'
    `).all();

    expect(results).toHaveLength(0);
  });
});

describe('session_logs table', () => {
  it('stores tool use with JSON input', () => {
    const id = randomUUID();
    const now = new Date().toISOString();
    const toolInput = JSON.stringify({ path: 'src/auth.ts' });

    db.$client.prepare(`
      INSERT INTO session_logs (id, session_id, agent_id, turn_index, role, content, tool_name, tool_input, created_at, processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'sess-1', 'agent-1', 1, 'tool', 'file contents...', 'Read', toolInput, now, 0);

    const row = db.$client.prepare('SELECT * FROM session_logs WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.tool_name).toBe('Read');
    expect(JSON.parse(row.tool_input as string)).toEqual({ path: 'src/auth.ts' });
    expect(row.processed).toBe(0);
  });
});

describe('default values', () => {
  it('containers default status to active', () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO containers (id, para_type, name, scope, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, 'project', 'Test', 'global', now, now);

    const row = db.$client.prepare('SELECT status FROM containers WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.status).toBe('active');
  });

  it('facts default confidence to 1.0 and decay_rate to 0.02', () => {
    const id = randomUUID();
    const now = new Date().toISOString();

    db.$client.prepare(`
      INSERT INTO facts (id, type, content, scope, source_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'observation', 'Test fact', 'global', 'stated', now, now);

    const row = db.$client.prepare('SELECT confidence, decay_rate FROM facts WHERE id = ?').get(id) as Record<string, unknown>;
    expect(row.confidence).toBe(1.0);
    expect(row.decay_rate).toBe(0.02);
  });
});
