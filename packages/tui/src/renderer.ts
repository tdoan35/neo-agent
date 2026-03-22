/**
 * Terminal renderer for Agent SDK streaming messages.
 *
 * Handles SDKMessage types from query() AsyncGenerator and renders
 * them to stdout with appropriate formatting.
 */

// SDK message type discriminators (subset we care about)
interface SDKAssistantMessage {
  type: 'assistant';
  message: { content: Array<{ type: string; text?: string }> };
  session_id: string;
}

interface SDKResultMessage {
  type: 'result';
  subtype: string;
  result: string;
  duration_ms: number;
  num_turns: number;
  usage?: { input_tokens: number; output_tokens: number };
  total_cost_usd?: number;
  errors?: string[];
}

interface SDKToolProgressMessage {
  type: 'tool_progress';
  tool_name?: string;
  content?: string;
  elapsed_time_ms?: number;
}

interface SDKToolUseSummaryMessage {
  type: 'tool_use_summary';
  tool_name?: string;
  result_summary?: string;
}

interface SDKSystemMessage {
  type: 'system';
  subtype: string;
  [key: string]: unknown;
}

interface SDKStatusMessage {
  type: 'status';
  subtype: string;
  message?: string;
  [key: string]: unknown;
}

type SDKMessage =
  | SDKAssistantMessage
  | SDKResultMessage
  | SDKToolProgressMessage
  | SDKToolUseSummaryMessage
  | SDKSystemMessage
  | SDKStatusMessage
  | { type: string; [key: string]: unknown };

// ANSI color helpers
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BLUE = '\x1b[34m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RED = '\x1b[31m';

export interface RenderOptions {
  showToolProgress?: boolean;
  showCost?: boolean;
  showTimings?: boolean;
}

const DEFAULT_OPTIONS: RenderOptions = {
  showToolProgress: true,
  showCost: true,
  showTimings: true,
};

/**
 * Render a stream of SDK messages to the terminal.
 * Consumes the AsyncGenerator and writes to stdout.
 * Returns the final assistant response text.
 */
export async function renderStream(
  stream: AsyncIterable<SDKMessage>,
  options: RenderOptions = DEFAULT_OPTIONS,
): Promise<string> {
  let fullResponse = '';
  let hasStartedOutput = false;
  let currentToolName: string | null = null;

  for await (const msg of stream) {
    switch (msg.type) {
      case 'assistant': {
        const assistantMsg = msg as SDKAssistantMessage;
        const textBlocks = assistantMsg.message?.content?.filter(b => b.type === 'text' && b.text);
        if (textBlocks?.length) {
          for (const block of textBlocks) {
            if (!hasStartedOutput) {
              hasStartedOutput = true;
            }
            const text = block.text ?? '';
            process.stdout.write(text);
            fullResponse += text;
          }
        }
        break;
      }

      case 'tool_progress': {
        if (!options.showToolProgress) break;
        const toolMsg = msg as SDKToolProgressMessage;
        const toolName = toolMsg.tool_name ?? 'tool';
        if (toolName !== currentToolName) {
          if (currentToolName) {
            clearToolStatus();
          }
          currentToolName = toolName;
        }
        writeToolStatus(`${DIM}${CYAN}  ⧖ ${toolName}...${RESET}`);
        break;
      }

      case 'tool_use_summary': {
        if (!options.showToolProgress) break;
        clearToolStatus();
        currentToolName = null;
        const summary = msg as SDKToolUseSummaryMessage;
        if (summary.tool_name) {
          process.stdout.write(`${DIM}${GREEN}  ✓ ${summary.tool_name}${RESET}\n`);
        }
        break;
      }

      case 'result': {
        const resultMsg = msg as SDKResultMessage;
        clearToolStatus();
        currentToolName = null;

        // Ensure newline after response
        if (hasStartedOutput && !fullResponse.endsWith('\n')) {
          process.stdout.write('\n');
        }

        // If we didn't get text via assistant messages, use result
        if (!fullResponse && resultMsg.result) {
          process.stdout.write(resultMsg.result);
          fullResponse = resultMsg.result;
          if (!fullResponse.endsWith('\n')) {
            process.stdout.write('\n');
          }
        }

        // Show stats
        if (options.showTimings || options.showCost) {
          const parts: string[] = [];
          if (options.showTimings && resultMsg.duration_ms) {
            parts.push(`${(resultMsg.duration_ms / 1000).toFixed(1)}s`);
          }
          if (resultMsg.num_turns) {
            parts.push(`${resultMsg.num_turns} turn${resultMsg.num_turns !== 1 ? 's' : ''}`);
          }
          if (resultMsg.usage) {
            parts.push(`${resultMsg.usage.input_tokens + resultMsg.usage.output_tokens} tokens`);
          }
          if (options.showCost && resultMsg.total_cost_usd) {
            parts.push(`$${resultMsg.total_cost_usd.toFixed(4)}`);
          }
          if (parts.length > 0) {
            process.stdout.write(`${DIM}  ${parts.join(' · ')}${RESET}\n`);
          }
        }

        // Show errors
        if (resultMsg.errors?.length) {
          for (const err of resultMsg.errors) {
            process.stdout.write(`${RED}Error: ${err}${RESET}\n`);
          }
        }
        break;
      }

      case 'system': {
        const sysMsg = msg as SDKSystemMessage;
        if (sysMsg.subtype === 'init') {
          // Session initialized — no output needed
        }
        break;
      }

      case 'status': {
        // Status updates — only show errors
        const statusMsg = msg as SDKStatusMessage;
        if (statusMsg.subtype === 'error' && statusMsg.message) {
          process.stdout.write(`${RED}${statusMsg.message}${RESET}\n`);
        }
        break;
      }

      default:
        // Unknown message types — ignore silently
        break;
    }
  }

  return fullResponse;
}

// Tool status line (overwritten in-place)
let hasToolStatus = false;

function writeToolStatus(text: string): void {
  if (hasToolStatus) {
    process.stdout.write('\r\x1b[K'); // Clear line
  }
  process.stdout.write(text);
  hasToolStatus = true;
}

function clearToolStatus(): void {
  if (hasToolStatus) {
    process.stdout.write('\r\x1b[K');
    hasToolStatus = false;
  }
}

/**
 * Format a system message (from slash commands, etc.) for display.
 */
export function renderSystemMessage(text: string): void {
  process.stdout.write(`${DIM}${text}${RESET}\n`);
}

/**
 * Render the status bar at the bottom.
 */
export function renderStatusBar(parts: string[]): void {
  const bar = parts.join(` ${DIM}│${RESET} `);
  process.stdout.write(`${DIM}─── ${bar} ───${RESET}\n`);
}

export { BOLD, DIM, RESET, BLUE, GREEN, YELLOW, CYAN, RED };
