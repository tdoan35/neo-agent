import type { DrizzleDB } from '@neo-agent/memory';
import {
  getBoard,
  formatForInjection,
  createTask,
  transitionTask,
  listFacts,
  listIdentities,
  getUnprocessedLogs,
} from '@neo-agent/memory';
import { runDiagnostics, type GatewayConfig } from '@neo-agent/gateway';

export interface CommandContext {
  db: DrizzleDB;
  agentId: string;
  projectId?: string;
  gatewayConfig: GatewayConfig;
}

export interface CommandResult {
  output: string;
  action?: 'quit' | 'new_session' | 'switch_agent';
  agentName?: string;
}

/**
 * Handle a slash command. Returns null if input is not a command.
 */
export async function handleCommand(
  input: string,
  context: CommandContext,
): Promise<CommandResult | null> {
  if (!input.startsWith('/')) return null;

  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const args = parts.slice(1);

  switch (cmd) {
    case 'tasks':
      return handleTasks(args, context);
    case 'status':
      return handleStatus(context);
    case 'dream':
      return handleDream(context);
    case 'agent':
      return handleAgent(args, context);
    case 'doctor':
      return handleDoctor(context);
    case 'new':
      return { output: 'Starting new session...', action: 'new_session' };
    case 'quit':
    case 'exit':
      return { output: 'Goodbye.', action: 'quit' };
    case 'help':
      return handleHelp();
    default:
      return { output: `Unknown command: /${cmd}. Type /help for available commands.` };
  }
}

function handleTasks(args: string[], ctx: CommandContext): CommandResult {
  const subCmd = args[0]?.toLowerCase();

  if (subCmd === 'add') {
    const title = args.slice(1).join(' ');
    if (!title) return { output: 'Usage: /tasks add <title>' };
    const task = createTask(ctx.db, { agentId: ctx.agentId, title, state: 'backlog' });
    return { output: `Created task "${task.title}" (${task.id.slice(0, 8)}) in backlog.` };
  }

  if (subCmd === 'done') {
    const taskId = args[1];
    if (!taskId) return { output: 'Usage: /tasks done <task-id>' };
    try {
      // Find task by partial ID
      const board = getBoard(ctx.db, ctx.agentId, ctx.projectId);
      const allTasks = [...board.active, ...board.backlog, ...board.blocked];
      const match = allTasks.find(t => t.id.startsWith(taskId));
      if (!match) return { output: `No active/backlog/blocked task matching "${taskId}".` };
      transitionTask(ctx.db, match.id, 'done');
      return { output: `Task "${match.title}" marked as done.` };
    } catch (err) {
      return { output: `Error: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // Default: show board
  const board = getBoard(ctx.db, ctx.agentId, ctx.projectId);
  const formatted = formatForInjection(board);
  return { output: formatted || 'No tasks.' };
}

function handleStatus(ctx: CommandContext): CommandResult {
  const facts = listFacts(ctx.db);
  const board = getBoard(ctx.db, ctx.agentId, ctx.projectId);
  const activeTasks = board.active.length;
  const totalTasks = board.active.length + board.backlog.length + board.blocked.length + board.done.length;

  const lines = [
    '## Status',
    `- Facts: ${facts.length}`,
    `- Tasks: ${activeTasks} active / ${totalTasks} total`,
    `- Agent: ${ctx.agentId}`,
  ];

  if (ctx.projectId) lines.push(`- Project: ${ctx.projectId}`);
  return { output: lines.join('\n') };
}

function handleDream(ctx: CommandContext): CommandResult {
  const unprocessed = getUnprocessedLogs(ctx.db);
  const sessionIds = new Set(unprocessed.map(l => l.sessionId));

  if (sessionIds.size === 0) {
    return { output: 'No unprocessed sessions to consolidate.' };
  }

  return {
    output: `Dream processing queued. ${sessionIds.size} session(s) with ${unprocessed.length} log entries.`,
  };
}

function handleAgent(args: string[], ctx: CommandContext): CommandResult {
  const subCmd = args[0]?.toLowerCase();

  if (subCmd === 'list') {
    const identities = listIdentities(ctx.db);
    if (identities.length === 0) {
      return { output: 'No agent identities configured. Run onboarding to set one up.' };
    }
    const lines = identities.map(i => `- ${i.name} (${i.id.slice(0, 8)})`);
    return { output: ['## Agents', ...lines].join('\n') };
  }

  if (subCmd === 'switch') {
    const name = args[1];
    if (!name) return { output: 'Usage: /agent switch <name>' };
    return { output: `Switching to agent "${name}"...`, action: 'switch_agent', agentName: name };
  }

  // Default: show current agent
  return { output: `Current agent: ${ctx.agentId}` };
}

async function handleDoctor(ctx: CommandContext): Promise<CommandResult> {
  const results = await runDiagnostics(ctx.gatewayConfig);
  const lines = results.map(r => {
    const icon = r.status === 'ok' ? '[OK]' : r.status === 'warn' ? '[WARN]' : '[FAIL]';
    return `${icon} ${r.check}: ${r.message}`;
  });
  return { output: ['## Diagnostics', ...lines].join('\n') };
}

function handleHelp(): CommandResult {
  return {
    output: [
      '## Commands',
      '/tasks              — Show task board',
      '/tasks add <title>  — Add task to backlog',
      '/tasks done <id>    — Mark task as done',
      '/status             — Show memory stats',
      '/dream              — Trigger memory consolidation',
      '/agent              — Show current agent',
      '/agent list         — List available agents',
      '/agent switch <n>   — Switch agent identity',
      '/doctor             — Run diagnostics',
      '/new                — Start new session',
      '/quit               — Exit',
    ].join('\n'),
  };
}
