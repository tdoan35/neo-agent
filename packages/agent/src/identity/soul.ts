import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const MEMORY_INSTRUCTIONS = `## Memory Tools

You have access to a persistent memory system via MCP tools:

- **memory_recall**: Retrieve relevant context for your current task
- **memory_store**: Save important facts, decisions, or observations
- **memory_search**: Search the knowledge base
- **memory_working_state**: View and manage your task board
- **memory_handoff**: Save a session summary for continuity
- **memory_dream**: Trigger deep memory consolidation

Your working memory (active tasks) is automatically loaded at session start.
Relevant knowledge is automatically retrieved based on the conversation.
Use memory_store to explicitly save things you want to remember long-term.`;

/**
 * Load a SOUL.md file from disk.
 * Returns the file content, or a default identity prompt if the file doesn't exist.
 */
export async function loadSoulFile(path: string): Promise<string> {
  const resolved = path.startsWith('~/')
    ? path.replace('~', process.env.HOME ?? '/tmp')
    : path;

  if (!existsSync(resolved)) {
    return 'You are a helpful AI assistant with persistent memory capabilities.';
  }

  return readFile(resolved, 'utf-8');
}

/**
 * Assemble the full system prompt from identity + memory instructions.
 */
export function assembleSystemPrompt(
  soulContent: string,
  memoryInstructions: string = MEMORY_INSTRUCTIONS,
): string {
  return `${soulContent}\n\n${memoryInstructions}`;
}

export { MEMORY_INSTRUCTIONS };
