import { readFile, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { globSync } from 'node:fs';

/**
 * Tool definitions for the secondary agent (Vercel AI SDK path).
 *
 * These mirror a subset of the Agent SDK's built-in tools.
 * Each tool is a simple { description, parameters, execute } object
 * compatible with Vercel AI SDK's tool() helper.
 */

export interface ToolDefinition {
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export const readFileTool: ToolDefinition = {
  description: 'Read a file from the filesystem',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to read' },
    },
    required: ['path'],
  },
  execute: async (args) => {
    try {
      return await readFile(args.path as string, 'utf-8');
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const writeFileTool: ToolDefinition = {
  description: 'Write content to a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'File path to write' },
      content: { type: 'string', description: 'Content to write' },
    },
    required: ['path', 'content'],
  },
  execute: async (args) => {
    try {
      await writeFile(args.path as string, args.content as string, 'utf-8');
      return `File written: ${args.path}`;
    } catch (err) {
      return `Error: ${err instanceof Error ? err.message : String(err)}`;
    }
  },
};

export const bashTool: ToolDefinition = {
  description: 'Execute a shell command',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    try {
      const output = execSync(args.command as string, {
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
      return output;
    } catch (err: any) {
      return `Exit code: ${err.status}\n${err.stderr ?? err.message}`;
    }
  },
};

export const grepTool: ToolDefinition = {
  description: 'Search file contents with a regex pattern',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern to search for' },
      path: { type: 'string', description: 'Directory or file to search in' },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    try {
      const searchPath = (args.path as string) || '.';
      const output = execSync(
        `grep -rn "${(args.pattern as string).replace(/"/g, '\\"')}" ${searchPath} 2>/dev/null | head -50`,
        { encoding: 'utf-8', timeout: 10000 },
      );
      return output || 'No matches found.';
    } catch {
      return 'No matches found.';
    }
  },
};

/** Get all built-in tools as a map */
export function getBuiltinTools(): Record<string, ToolDefinition> {
  return {
    readFile: readFileTool,
    writeFile: writeFileTool,
    bash: bashTool,
    grep: grepTool,
  };
}
