/**
 * Auth handling for Agent SDK.
 *
 * The Agent SDK handles authentication internally — it uses the same auth
 * mechanism as Claude Code:
 *
 * 1. Primary: Claude Max subscription via OAuth token (CLAUDE_CODE_OAUTH_TOKEN)
 * 2. Fallback: API key via ANTHROPIC_API_KEY
 *
 * This module provides configuration helpers and validation.
 */

export type AuthMethod = 'oauth' | 'api_key' | 'none';

export interface AuthConfig {
  method: AuthMethod;
  token?: string;
}

/** Detect which auth method is available from environment */
export function detectAuth(): AuthConfig {
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauthToken) {
    return { method: 'oauth', token: oauthToken };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return { method: 'api_key', token: apiKey };
  }

  return { method: 'none' };
}

/** Check if auth is configured */
export function isAuthConfigured(): boolean {
  return detectAuth().method !== 'none';
}
