import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loadSoulFile, assembleSystemPrompt, MEMORY_INSTRUCTIONS } from '../src/identity/soul.js';

describe('loadSoulFile', () => {
  it('returns default prompt when file does not exist', async () => {
    const result = await loadSoulFile('/nonexistent/SOUL.md');
    expect(result).toContain('helpful AI assistant');
  });

  it('reads SOUL.md content from disk', async () => {
    const dir = join(tmpdir(), `soul-test-${randomUUID()}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'SOUL.md');
    writeFileSync(path, '# Dana\nYou are Dana, a curious and supportive assistant.');

    const result = await loadSoulFile(path);
    expect(result).toContain('Dana');
    expect(result).toContain('curious and supportive');
  });
});

describe('assembleSystemPrompt', () => {
  it('combines soul content with memory instructions', () => {
    const soul = 'You are a test assistant.';
    const prompt = assembleSystemPrompt(soul);

    expect(prompt).toContain('You are a test assistant.');
    expect(prompt).toContain('Memory Tools');
    expect(prompt).toContain('memory_recall');
    expect(prompt).toContain('memory_store');
    expect(prompt).toContain('memory_search');
    expect(prompt).toContain('memory_working_state');
    expect(prompt).toContain('memory_handoff');
    expect(prompt).toContain('memory_dream');
  });

  it('accepts custom memory instructions', () => {
    const prompt = assembleSystemPrompt('Soul', 'Custom instructions');
    expect(prompt).toBe('Soul\n\nCustom instructions');
  });
});
