import { existsSync } from 'node:fs';
import { createDatabase } from '@neo-agent/memory';
import type { GatewayConfig } from './daemon.js';

export interface DiagnosticResult {
  check: string;
  status: 'ok' | 'warn' | 'fail';
  message: string;
}

function resolvePath(p: string): string {
  if (p.startsWith('~/')) {
    return p.replace('~', process.env.HOME ?? '/tmp');
  }
  return p;
}

async function checkNodeVersion(): Promise<DiagnosticResult> {
  const major = parseInt(process.version.slice(1).split('.')[0], 10);
  return {
    check: 'Node.js version',
    status: major >= 22 ? 'ok' : 'fail',
    message: major >= 22 ? `v${process.version} (≥22)` : `v${process.version} — requires ≥22`,
  };
}

async function checkDatabase(dbPath: string): Promise<DiagnosticResult> {
  try {
    const resolved = resolvePath(dbPath);
    const db = createDatabase(resolved);
    // Quick query to verify
    (db as any).all?.('SELECT 1');
    return { check: 'Database', status: 'ok', message: `Accessible at ${resolved}` };
  } catch (err) {
    return { check: 'Database', status: 'fail', message: `Cannot open: ${err instanceof Error ? err.message : String(err)}` };
  }
}

async function checkOllama(ollamaUrl: string): Promise<DiagnosticResult> {
  try {
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) {
      return { check: 'Ollama', status: 'warn', message: `Reachable but returned ${resp.status}` };
    }
    return { check: 'Ollama', status: 'ok', message: `Connected at ${ollamaUrl}` };
  } catch {
    return { check: 'Ollama', status: 'warn', message: `Not reachable at ${ollamaUrl}` };
  }
}

async function checkOllamaModel(ollamaUrl: string, model: string): Promise<DiagnosticResult> {
  try {
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) {
      return { check: `Model: ${model}`, status: 'warn', message: 'Cannot check — Ollama unreachable' };
    }
    const data = await resp.json() as { models?: Array<{ name: string }> };
    const found = data.models?.some(m => m.name.startsWith(model));
    return {
      check: `Model: ${model}`,
      status: found ? 'ok' : 'warn',
      message: found ? 'Available' : `Not found — run \`ollama pull ${model}\``,
    };
  } catch {
    return { check: `Model: ${model}`, status: 'warn', message: 'Cannot check — Ollama unreachable' };
  }
}

async function checkPidFile(pidFile: string): Promise<DiagnosticResult> {
  const resolved = resolvePath(pidFile);
  if (!existsSync(resolved)) {
    return { check: 'PID file', status: 'ok', message: 'No stale PID file' };
  }
  return { check: 'PID file', status: 'warn', message: `PID file exists at ${resolved}` };
}

async function checkAgentSdk(): Promise<DiagnosticResult> {
  try {
    await import('@anthropic-ai/claude-agent-sdk');
    return { check: 'Agent SDK', status: 'ok', message: 'Importable' };
  } catch {
    return { check: 'Agent SDK', status: 'fail', message: 'Cannot import @anthropic-ai/claude-agent-sdk' };
  }
}

export async function runDiagnostics(config: GatewayConfig): Promise<DiagnosticResult[]> {
  return Promise.all([
    checkNodeVersion(),
    checkDatabase(config.dbPath),
    checkOllama(config.ollamaUrl),
    checkOllamaModel(config.ollamaUrl, 'nomic-embed-text'),
    checkOllamaModel(config.ollamaUrl, 'qwen3:8b'),
    checkPidFile(config.pidFile),
    checkAgentSdk(),
  ]);
}
