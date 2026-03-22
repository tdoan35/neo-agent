import { createServer, type Server } from 'node:http';
import type { DrizzleDB } from '@neo-agent/memory';
import { listFacts, listEntities } from '@neo-agent/memory';

export interface HealthServer {
  close(): Promise<void>;
  port: number;
}

async function checkOllama(ollamaUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function startHealthServer(
  port: number,
  db: DrizzleDB,
  ollamaUrl: string,
): Promise<HealthServer> {
  const startedAt = Date.now();

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname === '/health') {
      const ollamaConnected = await checkOllama(ollamaUrl);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        db: 'connected',
        ollama: ollamaConnected ? 'connected' : 'disconnected',
      }));
      return;
    }

    if (url.pathname === '/status') {
      const facts = listFacts(db);
      const entities = listEntities(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        memoryStats: {
          facts: facts.length,
          entities: entities.length,
        },
      }));
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({
        port: actualPort,
        close: () => closeServer(server),
      });
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}
