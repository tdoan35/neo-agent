#!/usr/bin/env node

/**
 * neo-agent CLI — Terminal interface for the memory-augmented AI assistant.
 *
 * Usage:
 *   pnpm start                  # Start with defaults
 *   pnpm start --db ./my.db     # Custom database path
 *   pnpm start --model opus     # Preferred model
 */

import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { createDatabase, createMockEmbeddingProvider, createOllamaEmbeddingProvider, listIdentities } from '@neo-agent/memory';
import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { prepareAgentSession } from '@neo-agent/agent';
import { DEFAULT_GATEWAY_CONFIG } from '@neo-agent/gateway';
import { handleCommand, type CommandContext, type CommandResult } from './commands/handler.js';
import { needsOnboarding } from './onboarding/wizard.js';
import { runInteractiveOnboarding } from './onboarding/interactive.js';
import { renderStream, renderSystemMessage, renderStatusBar, BOLD, DIM, RESET, GREEN, RED, CYAN, YELLOW } from './renderer.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface CliConfig {
  dbPath: string;
  ollamaUrl: string;
  model?: string;
  agentId?: string;
  projectId?: string;
}

function resolveHome(p: string): string {
  return p.startsWith('~/') ? p.replace('~', process.env.HOME ?? '/tmp') : p;
}

function parseArgs(): Partial<CliConfig> {
  const args = process.argv.slice(2);
  const config: Partial<CliConfig> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--db' && args[i + 1]) config.dbPath = args[++i];
    if (args[i] === '--model' && args[i + 1]) config.model = args[++i];
    if (args[i] === '--agent' && args[i + 1]) config.agentId = args[++i];
    if (args[i] === '--project' && args[i + 1]) config.projectId = args[++i];
    if (args[i] === '--ollama' && args[i + 1]) config.ollamaUrl = args[++i];
    if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
${BOLD}neo-agent${RESET} — AI assistant with persistent memory

${BOLD}Usage:${RESET}
  pnpm start [options]

${BOLD}Options:${RESET}
  --db <path>       Database path (default: ~/.agent/memory.db)
  --model <name>    Preferred model
  --agent <id>      Agent identity ID
  --project <id>    Project scope
  --ollama <url>    Ollama URL (default: http://localhost:11434)
  --help, -h        Show this help
`);
      process.exit(0);
    }
  }
  return config;
}

// ---------------------------------------------------------------------------
// Embedding provider with Ollama fallback
// ---------------------------------------------------------------------------

async function createEmbeddingProvider(ollamaUrl: string): Promise<EmbeddingProvider> {
  // Try Ollama first
  try {
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (resp.ok) {
      return createOllamaEmbeddingProvider({ baseUrl: ollamaUrl });
    }
  } catch {
    // Fall through
  }

  console.log(`${YELLOW}⚠${RESET} ${DIM}Ollama not available — using mock embeddings. Semantic search will be limited.${RESET}`);
  return createMockEmbeddingProvider();
}

// ---------------------------------------------------------------------------
// Agent interaction
// ---------------------------------------------------------------------------

async function sendToAgent(
  prompt: string,
  db: DrizzleDB,
  embeddingProvider: EmbeddingProvider,
  agentId: string,
  projectId?: string,
  model?: string,
): Promise<string> {
  let query: typeof import('@anthropic-ai/claude-agent-sdk').query;
  try {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    query = sdk.query;
  } catch {
    const msg = `${YELLOW}Agent SDK not available.${RESET} Set ANTHROPIC_API_KEY or authenticate Claude Code.\n\nUse /tasks, /status, /dream and other slash commands to interact with the memory system directly.`;
    console.log(msg);
    return msg;
  }

  const session = await prepareAgentSession({
    db,
    embeddingProvider,
    agentId,
    projectId,
    model,
  });

  try {
    const stream = query({
      prompt,
      options: {
        model: session.model,
        hooks: session.hooks as any,
        mcpServers: { memory: session.mcpServerConfig as any },
        systemPrompt: session.systemPrompt,
      },
    });

    return await renderStream(stream as any);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`${RED}Agent error: ${msg}${RESET}`);
    return '';
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();

  const config: CliConfig = {
    dbPath: resolveHome(args.dbPath ?? '~/.agent/memory.db'),
    ollamaUrl: args.ollamaUrl ?? 'http://localhost:11434',
    model: args.model,
    agentId: args.agentId,
    projectId: args.projectId,
  };

  // Ensure directory exists
  const dbDir = join(config.dbPath, '..');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  // Initialize database
  const db = createDatabase(config.dbPath);
  const embeddingProvider = await createEmbeddingProvider(config.ollamaUrl);

  // Create readline interface
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  // Onboarding check
  if (needsOnboarding(db)) {
    const presetsDir = join(process.cwd(), 'config', 'identities');
    await runInteractiveOnboarding(db, embeddingProvider, rl, presetsDir);
  }

  // Resolve agent identity
  let agentId = config.agentId ?? 'primary';
  const identities = listIdentities(db);
  if (identities.length > 0 && !config.agentId) {
    agentId = identities[0].name.toLowerCase();
    console.log(`${DIM}Agent: ${identities[0].name} (${identities[0].role})${RESET}`);
  }

  // Welcome
  console.log(`${DIM}Type a message to chat, or /help for commands. /quit to exit.${RESET}`);
  console.log();

  // Command context
  const cmdCtx: CommandContext = {
    db,
    agentId,
    projectId: config.projectId,
    gatewayConfig: { ...DEFAULT_GATEWAY_CONFIG, dbPath: config.dbPath, ollamaUrl: config.ollamaUrl },
  };

  // Chat loop
  let isProcessing = false;
  let shouldExit = false;

  const promptUser = () => {
    rl.question(`${BOLD}>${RESET} `, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        if (!shouldExit) promptUser();
        return;
      }

      // Check slash commands first
      if (trimmed.startsWith('/')) {
        const result = await handleCommand(trimmed, cmdCtx);
        if (result) {
          if (result.output) {
            renderSystemMessage(result.output);
          }
          if (result.action === 'quit') {
            console.log(`${DIM}Goodbye.${RESET}`);
            process.exit(0);
          }
          if (result.action === 'switch_agent' && result.agentName) {
            agentId = result.agentName.toLowerCase();
            cmdCtx.agentId = agentId;
            renderSystemMessage(`Switched to agent: ${result.agentName}`);
          }
        }
        console.log();
        if (!shouldExit) promptUser();
        return;
      }

      // Send to agent
      console.log();
      isProcessing = true;
      try {
        await sendToAgent(trimmed, db, embeddingProvider, agentId, config.projectId, config.model);
      } catch (err) {
        console.log(`${RED}Error: ${err instanceof Error ? err.message : String(err)}${RESET}`);
      }
      isProcessing = false;
      console.log();
      if (shouldExit) {
        process.exit(0);
      }
      promptUser();
    });
  };

  promptUser();

  // Handle SIGINT / EOF gracefully — wait for in-flight requests
  rl.on('close', () => {
    if (isProcessing) {
      shouldExit = true; // Will exit after current request completes
    } else {
      console.log(`\n${DIM}Goodbye.${RESET}`);
      process.exit(0);
    }
  });
}

main().catch((err) => {
  console.error(`${RED}Fatal error: ${err.message}${RESET}`);
  process.exit(1);
});
