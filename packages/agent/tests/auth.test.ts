import { describe, it, expect, afterEach } from 'vitest';
import { detectAuth, isAuthConfigured } from '../src/primary/auth.js';

const originalEnv = { ...process.env };

afterEach(() => {
  // Restore original env
  process.env = { ...originalEnv };
});

describe('detectAuth', () => {
  it('detects OAuth token', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'test-oauth-token';
    delete process.env.ANTHROPIC_API_KEY;

    const auth = detectAuth();
    expect(auth.method).toBe('oauth');
    expect(auth.token).toBe('test-oauth-token');
  });

  it('falls back to API key', () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.ANTHROPIC_API_KEY = 'sk-test-key';

    const auth = detectAuth();
    expect(auth.method).toBe('api_key');
    expect(auth.token).toBe('sk-test-key');
  });

  it('returns none when no auth configured', () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;

    const auth = detectAuth();
    expect(auth.method).toBe('none');
  });

  it('prefers OAuth over API key', () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'oauth';
    process.env.ANTHROPIC_API_KEY = 'api-key';

    const auth = detectAuth();
    expect(auth.method).toBe('oauth');
  });
});

describe('isAuthConfigured', () => {
  it('returns true when auth is available', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    expect(isAuthConfigured()).toBe(true);
  });

  it('returns false when no auth', () => {
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
    delete process.env.ANTHROPIC_API_KEY;
    expect(isAuthConfigured()).toBe(false);
  });
});
