import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { checkPidFile } from '../src/daemon.js';

function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'neo-agent-test-' + randomUUID());
  mkdirSync(dir, { recursive: true });
  return join(dir, name);
}

describe('checkPidFile', () => {
  it('returns false when no PID file exists', () => {
    const pidFile = join(tmpdir(), `nonexistent-${randomUUID()}.pid`);
    expect(checkPidFile(pidFile)).toBe(false);
  });

  it('returns true when PID file points to a running process', () => {
    const pidFile = tmpPath('running.pid');
    writeFileSync(pidFile, String(process.pid)); // current process is alive
    expect(checkPidFile(pidFile)).toBe(true);
    // Cleanup
    if (existsSync(pidFile)) unlinkSync(pidFile);
  });

  it('returns false and cleans up stale PID file', () => {
    const pidFile = tmpPath('stale.pid');
    writeFileSync(pidFile, '99999999'); // PID that almost certainly doesn't exist
    expect(checkPidFile(pidFile)).toBe(false);
    expect(existsSync(pidFile)).toBe(false); // Should have been cleaned up
  });

  it('returns false and cleans up invalid PID file', () => {
    const pidFile = tmpPath('invalid.pid');
    writeFileSync(pidFile, 'not-a-number');
    expect(checkPidFile(pidFile)).toBe(false);
    expect(existsSync(pidFile)).toBe(false);
  });
});
