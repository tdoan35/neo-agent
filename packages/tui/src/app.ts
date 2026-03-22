import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import type { GatewayConfig } from '@neo-agent/gateway';
import { getBoard, formatForInjection } from '@neo-agent/memory';
import { handleCommand, type CommandContext, type CommandResult } from './commands/handler.js';

export interface AppConfig {
  db: DrizzleDB;
  embeddingProvider: EmbeddingProvider;
  agentId: string;
  projectId?: string;
  gatewayConfig: GatewayConfig;
  onSendMessage: (message: string) => Promise<string>;
}

export interface AppState {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  isProcessing: boolean;
  currentAgent: string;
}

/**
 * Core TUI application logic — decoupled from rendering.
 * This can be used by any frontend (readline, Ink, web).
 */
export class App {
  private state: AppState;
  private config: AppConfig;

  constructor(config: AppConfig) {
    this.config = config;
    this.state = {
      messages: [],
      isProcessing: false,
      currentAgent: config.agentId,
    };
  }

  getState(): Readonly<AppState> {
    return this.state;
  }

  /** Process user input — either a slash command or a message to the agent */
  async processInput(input: string): Promise<CommandResult | { output: string }> {
    const trimmed = input.trim();
    if (!trimmed) return { output: '' };

    // Check for slash commands
    const ctx: CommandContext = {
      db: this.config.db,
      agentId: this.state.currentAgent,
      projectId: this.config.projectId,
      gatewayConfig: this.config.gatewayConfig,
    };

    const cmdResult = await handleCommand(trimmed, ctx);
    if (cmdResult) {
      this.state.messages.push({ role: 'system', content: cmdResult.output });

      if (cmdResult.action === 'switch_agent' && cmdResult.agentName) {
        this.state.currentAgent = cmdResult.agentName;
      }

      return cmdResult;
    }

    // Regular message — send to agent
    this.state.messages.push({ role: 'user', content: trimmed });
    this.state.isProcessing = true;

    try {
      const response = await this.config.onSendMessage(trimmed);
      this.state.messages.push({ role: 'assistant', content: response });
      this.state.isProcessing = false;
      return { output: response };
    } catch (err) {
      this.state.isProcessing = false;
      const errorMsg = `Error: ${err instanceof Error ? err.message : String(err)}`;
      this.state.messages.push({ role: 'system', content: errorMsg });
      return { output: errorMsg };
    }
  }

  /** Get current status bar content */
  getStatusBar(): string {
    const board = getBoard(this.config.db, this.state.currentAgent, this.config.projectId);
    const activeTask = board.active[0];
    const parts = [
      `Agent: ${this.state.currentAgent}`,
      activeTask ? `Task: ${activeTask.title}` : 'No active task',
      'Memory: Active',
    ];
    return parts.join(' | ');
  }
}
