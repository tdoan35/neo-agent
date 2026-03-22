import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createDatabase, type DrizzleDB, type EmbeddingProvider, createOllamaEmbeddingProvider } from '@neo-agent/memory';
import { createMemoryMcpServer } from '@neo-agent/mcp-server';
import { ProcessManager } from './process-mgr/manager.js';
import { startHealthServer, type HealthServer } from './health.js';

export interface GatewayConfig {
  dbPath: string;
  ollamaUrl: string;
  healthPort: number;
  pidFile: string;
}

export const DEFAULT_GATEWAY_CONFIG: GatewayConfig = {
  dbPath: '~/.agent/memory.db',
  ollamaUrl: 'http://localhost:11434',
  healthPort: 7832,
  pidFile: '~/.agent/gateway.pid',
};

export interface Gateway {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  mcpServer: ReturnType<typeof createMemoryMcpServer>;
  processManager: ProcessManager;
  config: GatewayConfig;
  shutdown(): Promise<void>;
}

function resolvePath(p: string): string {
  if (p.startsWith('~/')) {
    return p.replace('~', process.env.HOME ?? '/tmp');
  }
  return p;
}

export function checkPidFile(pidFile: string): boolean {
  const resolved = resolvePath(pidFile);
  if (!existsSync(resolved)) return false;
  const pid = parseInt(readFileSync(resolved, 'utf-8').trim(), 10);
  if (isNaN(pid)) {
    unlinkSync(resolved);
    return false;
  }
  try {
    process.kill(pid, 0); // Check if process is alive (signal 0)
    return true; // Process exists
  } catch {
    unlinkSync(resolved); // Stale PID file
    return false;
  }
}

function writePidFile(pidFile: string): void {
  const resolved = resolvePath(pidFile);
  const dir = dirname(resolved);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(resolved, String(process.pid), 'utf-8');
}

function removePidFile(pidFile: string): void {
  const resolved = resolvePath(pidFile);
  if (existsSync(resolved)) {
    unlinkSync(resolved);
  }
}

export async function startGateway(config?: Partial<GatewayConfig>): Promise<Gateway> {
  const cfg: GatewayConfig = { ...DEFAULT_GATEWAY_CONFIG, ...config };

  // 1. Check PID file
  if (checkPidFile(cfg.pidFile)) {
    throw new Error(`Gateway already running (PID file: ${resolvePath(cfg.pidFile)})`);
  }

  // 2. Write PID file
  writePidFile(cfg.pidFile);

  // 3. Initialize database
  const db = createDatabase(resolvePath(cfg.dbPath));

  // 4. Create embedding provider
  const embeddingProvider = createOllamaEmbeddingProvider({
    baseUrl: cfg.ollamaUrl,
  });

  // 5. Create in-process MCP memory server
  const mcpServer = createMemoryMcpServer({
    db,
    embeddingProvider,
    agentId: 'primary',
  });

  // 6. Initialize process manager
  const processManager = new ProcessManager();

  // 7. Start health check server
  let healthServer: HealthServer | null = null;
  try {
    healthServer = await startHealthServer(cfg.healthPort, db, cfg.ollamaUrl);
  } catch {
    // Health server is non-critical — log but continue
  }

  let shuttingDown = false;

  const gateway: Gateway = {
    db,
    embeddingProvider,
    mcpServer,
    processManager,
    config: cfg,
    async shutdown() {
      if (shuttingDown) return;
      shuttingDown = true;

      // 1. Close health server
      if (healthServer) {
        await healthServer.close();
      }

      // 2. Kill all managed processes
      processManager.killAll();

      // 3. Remove PID file
      removePidFile(cfg.pidFile);
    },
  };

  // Register signal handlers
  const onSignal = async () => {
    await gateway.shutdown();
    process.exit(0);
  };
  process.once('SIGTERM', onSignal);
  process.once('SIGINT', onSignal);

  return gateway;
}
