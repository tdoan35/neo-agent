import { describe, it, expect, afterEach } from 'vitest';
import { ProcessManager } from '../src/process-mgr/manager.js';

let mgr: ProcessManager;

afterEach(() => {
  mgr?.killAll();
});

describe('ProcessManager', () => {
  it('spawns a process and captures stdout', async () => {
    mgr = new ProcessManager();
    const proc = mgr.spawn('echo', ['hello']);

    await new Promise<void>((resolve) => {
      mgr.onComplete(proc.id, (p) => {
        expect(p.status).toBe('completed');
        expect(p.stdout.trim()).toBe('hello');
        expect(p.exitCode).toBe(0);
        resolve();
      });
    });
  });

  it('captures stderr from failed commands', async () => {
    mgr = new ProcessManager();
    const proc = mgr.spawn('node', ['-e', 'process.stderr.write("err"); process.exit(1)']);

    await new Promise<void>((resolve) => {
      mgr.onComplete(proc.id, (p) => {
        expect(p.status).toBe('failed');
        expect(p.stderr).toContain('err');
        expect(p.exitCode).toBe(1);
        resolve();
      });
    });
  });

  it('lists processes by status', async () => {
    mgr = new ProcessManager();
    const proc = mgr.spawn('echo', ['test']);

    expect(mgr.listProcesses()).toHaveLength(1);

    await new Promise<void>((resolve) => {
      mgr.onComplete(proc.id, () => resolve());
    });

    expect(mgr.listProcesses('completed')).toHaveLength(1);
    expect(mgr.listProcesses('running')).toHaveLength(0);
  });

  it('kills a running process', async () => {
    mgr = new ProcessManager();
    const proc = mgr.spawn('sleep', ['60']);

    expect(proc.status).toBe('running');
    const killed = mgr.kill(proc.id);
    expect(killed).toBe(true);

    await new Promise<void>((resolve) => {
      mgr.onComplete(proc.id, (p) => {
        expect(p.status).toBe('killed');
        resolve();
      });
    });
  });

  it('getProcess returns undefined for unknown id', () => {
    mgr = new ProcessManager();
    expect(mgr.getProcess('nonexistent')).toBeUndefined();
  });

  it('onComplete fires immediately for already-completed processes', async () => {
    mgr = new ProcessManager();
    const proc = mgr.spawn('echo', ['done']);

    // Wait for completion
    await new Promise<void>((resolve) => {
      mgr.onComplete(proc.id, () => resolve());
    });

    // Now call onComplete again — should fire immediately
    await new Promise<void>((resolve) => {
      mgr.onComplete(proc.id, (p) => {
        expect(p.status).toBe('completed');
        resolve();
      });
    });
  });
});
