import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';

export type ProcessStatus = 'running' | 'completed' | 'failed' | 'killed';

export interface ManagedProcess {
  id: string;
  command: string;
  args: string[];
  pid: number | undefined;
  status: ProcessStatus;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  startedAt: string;
  completedAt: string | null;
}

const MAX_BUFFER_SIZE = 1024 * 1024; // 1MB

function truncateBuffer(buffer: string, maxSize: number): string {
  if (buffer.length <= maxSize) return buffer;
  return buffer.slice(buffer.length - maxSize);
}

export class ProcessManager extends EventEmitter {
  private processes = new Map<string, { info: ManagedProcess; child: ChildProcess | null }>();

  spawn(
    command: string,
    args: string[] = [],
    options?: { cwd?: string; env?: Record<string, string>; maxBuffer?: number },
  ): ManagedProcess {
    const id = randomUUID();
    const maxBuf = options?.maxBuffer ?? MAX_BUFFER_SIZE;

    const child = spawn(command, args, {
      cwd: options?.cwd,
      env: options?.env ? { ...process.env, ...options.env } : undefined,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const info: ManagedProcess = {
      id,
      command,
      args,
      pid: child.pid,
      status: 'running',
      stdout: '',
      stderr: '',
      exitCode: null,
      startedAt: new Date().toISOString(),
      completedAt: null,
    };

    this.processes.set(id, { info, child });

    child.stdout?.on('data', (data: Buffer) => {
      info.stdout = truncateBuffer(info.stdout + data.toString(), maxBuf);
    });

    child.stderr?.on('data', (data: Buffer) => {
      info.stderr = truncateBuffer(info.stderr + data.toString(), maxBuf);
    });

    child.on('close', (code, signal) => {
      info.exitCode = code;
      info.completedAt = new Date().toISOString();
      if (info.status === 'killed') {
        // Already marked as killed
      } else if (code === 0) {
        info.status = 'completed';
      } else {
        info.status = signal ? 'killed' : 'failed';
      }
      this.emit('complete', info);
    });

    child.on('error', (err) => {
      info.status = 'failed';
      info.stderr += `\nSpawn error: ${err.message}`;
      info.completedAt = new Date().toISOString();
      this.emit('complete', info);
    });

    return info;
  }

  getProcess(id: string): ManagedProcess | undefined {
    return this.processes.get(id)?.info;
  }

  listProcesses(status?: ProcessStatus): ManagedProcess[] {
    const all = Array.from(this.processes.values()).map(p => p.info);
    return status ? all.filter(p => p.status === status) : all;
  }

  kill(id: string): boolean {
    const entry = this.processes.get(id);
    if (!entry || !entry.child || entry.info.status !== 'running') return false;

    entry.info.status = 'killed';
    entry.child.kill('SIGTERM');

    // Force kill after 5s if still alive
    const forceKillTimer = setTimeout(() => {
      if (entry.child && !entry.child.killed) {
        entry.child.kill('SIGKILL');
      }
    }, 5000);

    entry.child.once('close', () => clearTimeout(forceKillTimer));
    return true;
  }

  killAll(): void {
    for (const [id, entry] of this.processes) {
      if (entry.info.status === 'running') {
        this.kill(id);
      }
    }
  }

  onComplete(id: string, callback: (process: ManagedProcess) => void): void {
    const entry = this.processes.get(id);
    if (!entry) return;
    if (entry.info.status !== 'running') {
      callback(entry.info);
      return;
    }
    const listener = (completed: ManagedProcess) => {
      if (completed.id === id) {
        this.off('complete', listener);
        callback(completed);
      }
    };
    this.on('complete', listener);
  }
}
