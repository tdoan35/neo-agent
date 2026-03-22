import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import * as schema from './schema/index.js';
import { EMBEDDING_DIMENSIONS } from '@neo-agent/shared';

export type DrizzleDB = ReturnType<typeof createDatabase>;

const FTS5_STATEMENTS = [
  `CREATE VIRTUAL TABLE IF NOT EXISTS session_logs_fts
   USING fts5(content, content=session_logs, content_rowid=rowid)`,

  `CREATE TRIGGER IF NOT EXISTS session_logs_ai AFTER INSERT ON session_logs BEGIN
     INSERT INTO session_logs_fts(rowid, content) VALUES (new.rowid, new.content);
   END`,

  `CREATE TRIGGER IF NOT EXISTS session_logs_au AFTER UPDATE ON session_logs BEGIN
     INSERT INTO session_logs_fts(session_logs_fts, rowid, content) VALUES('delete', old.rowid, old.content);
     INSERT INTO session_logs_fts(rowid, content) VALUES (new.rowid, new.content);
   END`,

  `CREATE TRIGGER IF NOT EXISTS session_logs_ad AFTER DELETE ON session_logs BEGIN
     INSERT INTO session_logs_fts(session_logs_fts, rowid, content) VALUES('delete', old.rowid, old.content);
   END`,
];

export function createDatabase(dbPath: string) {
  const sqlite = new Database(dbPath);

  // SQLite pragmas
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  const db = drizzle(sqlite, { schema });

  // Create all tables from schema (using Drizzle's push approach for dev)
  // In production, use drizzle-kit migrations
  createTables(sqlite);

  // Set up FTS5 full-text search
  for (const stmt of FTS5_STATEMENTS) {
    sqlite.exec(stmt);
  }

  // Load sqlite-vec extension and create vector table
  sqliteVec.load(sqlite);
  sqlite.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_embeddings USING vec0(id TEXT PRIMARY KEY, vector FLOAT[${EMBEDDING_DIMENSIONS}])`);

  return db;
}

function createTables(sqlite: Database.Database) {
  // containers
  sqlite.exec(`CREATE TABLE IF NOT EXISTS containers (
    id TEXT PRIMARY KEY,
    para_type TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    outcome TEXT,
    deadline TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    area_of_life TEXT,
    parent_id TEXT,
    scope TEXT NOT NULL DEFAULT 'private',
    owner_agent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    archived_at TEXT
  )`);

  // entities
  sqlite.exec(`CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    description TEXT,
    container_id TEXT,
    scope TEXT NOT NULL DEFAULT 'global',
    project_id TEXT,
    owner_agent TEXT,
    source_session_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_accessed_at TEXT,
    confidence REAL NOT NULL DEFAULT 1.0
  )`);

  // facts
  sqlite.exec(`CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    entity_id TEXT,
    container_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    structured TEXT,
    scope TEXT NOT NULL DEFAULT 'global',
    project_id TEXT,
    owner_agent TEXT,
    source_session_id TEXT,
    source_type TEXT NOT NULL DEFAULT 'stated',
    extracted_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_confirmed_at TEXT,
    last_accessed_at TEXT,
    expires_at TEXT,
    confidence REAL NOT NULL DEFAULT 1.0,
    decay_rate REAL NOT NULL DEFAULT 0.02,
    supersedes_fact_id TEXT
  )`);

  // relations
  sqlite.exec(`CREATE TABLE IF NOT EXISTS relations (
    id TEXT PRIMARY KEY,
    source_entity_id TEXT NOT NULL,
    target_entity_id TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT,
    directional INTEGER NOT NULL DEFAULT 1,
    scope TEXT NOT NULL DEFAULT 'global',
    project_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0
  )`);

  // entity_containers
  sqlite.exec(`CREATE TABLE IF NOT EXISTS entity_containers (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL,
    container_id TEXT NOT NULL,
    role TEXT,
    added_at TEXT NOT NULL
  )`);

  // working_memory
  sqlite.exec(`CREATE TABLE IF NOT EXISTS working_memory (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    project_id TEXT,
    title TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'backlog',
    context TEXT,
    decisions TEXT NOT NULL DEFAULT '[]',
    blockers TEXT,
    open_questions TEXT NOT NULL DEFAULT '[]',
    handoff_summary TEXT,
    scope TEXT NOT NULL DEFAULT 'private',
    owner_agent TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    completed_at TEXT
  )`);

  // session_logs
  sqlite.exec(`CREATE TABLE IF NOT EXISTS session_logs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    project_id TEXT,
    surface TEXT,
    turn_index INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_name TEXT,
    tool_input TEXT,
    model TEXT,
    token_count INTEGER,
    created_at TEXT NOT NULL,
    processed INTEGER NOT NULL DEFAULT 0,
    processed_at TEXT,
    batch_run_id TEXT
  )`);

  // skills
  sqlite.exec(`CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    file_path TEXT NOT NULL,
    category TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    related_entity_ids TEXT NOT NULL DEFAULT '[]',
    times_used INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    success_rate REAL,
    scope TEXT NOT NULL DEFAULT 'global',
    project_id TEXT,
    synthesized_from TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0
  )`);

  // embeddings
  sqlite.exec(`CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    text_content TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);

  // identities
  sqlite.exec(`CREATE TABLE IF NOT EXISTS identities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    tone TEXT NOT NULL,
    avatar TEXT NOT NULL,
    persona TEXT NOT NULL,
    boundaries TEXT NOT NULL DEFAULT '[]',
    soul_path TEXT NOT NULL,
    is_preset INTEGER NOT NULL DEFAULT 0,
    created_from TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  // batch_runs
  sqlite.exec(`CREATE TABLE IF NOT EXISTS batch_runs (
    id TEXT PRIMARY KEY,
    trigger_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    sessions_processed INTEGER NOT NULL DEFAULT 0,
    facts_created INTEGER NOT NULL DEFAULT 0,
    facts_updated INTEGER NOT NULL DEFAULT 0,
    facts_archived INTEGER NOT NULL DEFAULT 0,
    entities_created INTEGER NOT NULL DEFAULT 0,
    skills_created INTEGER NOT NULL DEFAULT 0,
    model TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    error TEXT
  )`);

  // cron_jobs
  sqlite.exec(`CREATE TABLE IF NOT EXISTS cron_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    schedule TEXT NOT NULL,
    prompt TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    deliver_to TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`);
}

