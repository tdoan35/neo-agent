import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type DrizzleDB, createTask, createIdentity, appendLog } from '@neo-agent/memory';
import { handleCommand, type CommandContext } from '../src/commands/handler.js';
import { DEFAULT_GATEWAY_CONFIG } from '@neo-agent/gateway';

let db: DrizzleDB;
let ctx: CommandContext;

beforeEach(() => {
  db = createDatabase(':memory:');
  ctx = {
    db,
    agentId: 'test-agent',
    gatewayConfig: DEFAULT_GATEWAY_CONFIG,
  };
});

describe('handleCommand', () => {
  it('returns null for non-command input', async () => {
    const result = await handleCommand('hello world', ctx);
    expect(result).toBeNull();
  });

  it('/help shows available commands', async () => {
    const result = await handleCommand('/help', ctx);
    expect(result).not.toBeNull();
    expect(result!.output).toContain('/tasks');
    expect(result!.output).toContain('/status');
    expect(result!.output).toContain('/dream');
    expect(result!.output).toContain('/quit');
  });

  it('/quit returns quit action', async () => {
    const result = await handleCommand('/quit', ctx);
    expect(result!.action).toBe('quit');
  });

  it('/new returns new_session action', async () => {
    const result = await handleCommand('/new', ctx);
    expect(result!.action).toBe('new_session');
  });

  it('unknown command returns error', async () => {
    const result = await handleCommand('/foobar', ctx);
    expect(result!.output).toContain('Unknown command');
  });
});

describe('/tasks', () => {
  it('shows task board', async () => {
    createTask(db, { agentId: 'test-agent', title: 'Active task', state: 'active' });
    createTask(db, { agentId: 'test-agent', title: 'Backlog task', state: 'backlog' });

    const result = await handleCommand('/tasks', ctx);
    expect(result!.output).toContain('Active task');
    expect(result!.output).toContain('Backlog task');
  });

  it('/tasks add creates a task', async () => {
    const result = await handleCommand('/tasks add Build auth module', ctx);
    expect(result!.output).toContain('Created task');
    expect(result!.output).toContain('Build auth module');
  });

  it('/tasks add with no title shows usage', async () => {
    const result = await handleCommand('/tasks add', ctx);
    expect(result!.output).toContain('Usage');
  });

  it('/tasks done marks task as done', async () => {
    const task = createTask(db, { agentId: 'test-agent', title: 'Finish PR', state: 'active' });
    const shortId = task.id.slice(0, 8);

    const result = await handleCommand(`/tasks done ${shortId}`, ctx);
    expect(result!.output).toContain('done');
  });
});

describe('/status', () => {
  it('shows memory stats', async () => {
    const result = await handleCommand('/status', ctx);
    expect(result!.output).toContain('Status');
    expect(result!.output).toContain('Facts');
    expect(result!.output).toContain('Tasks');
  });
});

describe('/dream', () => {
  it('reports no unprocessed sessions when empty', async () => {
    const result = await handleCommand('/dream', ctx);
    expect(result!.output).toContain('No unprocessed sessions');
  });

  it('reports count when sessions exist', async () => {
    appendLog(db, { sessionId: 's1', agentId: 'a', turnIndex: 0, role: 'user', content: 'msg' });

    const result = await handleCommand('/dream', ctx);
    expect(result!.output).toContain('1 session');
  });
});

describe('/agent', () => {
  it('shows current agent', async () => {
    const result = await handleCommand('/agent', ctx);
    expect(result!.output).toContain('test-agent');
  });

  it('/agent list shows identities', async () => {
    createIdentity(db, {
      name: 'Dana',
      role: 'Executive Assistant',
      tone: 'stern',
      avatar: { color: '#E63946', letter: 'D' },
      persona: 'Direct and organized',
      soulPath: '/path/to/dana.md',
      isPreset: true,
    });

    const result = await handleCommand('/agent list', ctx);
    expect(result!.output).toContain('Dana');
  });

  it('/agent switch returns switch action', async () => {
    const result = await handleCommand('/agent switch Dana', ctx);
    expect(result!.action).toBe('switch_agent');
    expect(result!.agentName).toBe('Dana');
  });
});
