import { createInterface, type Interface } from 'node:readline';
import type { DrizzleDB, EmbeddingProvider } from '@neo-agent/memory';
import { processOnboarding, AVAILABLE_PRESETS, type OnboardingAnswers } from './wizard.js';
import { BOLD, DIM, RESET, CYAN, GREEN, YELLOW } from '../renderer.js';

function ask(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function askChoice(rl: Interface, question: string, options: string[]): Promise<number> {
  return new Promise((resolve) => {
    const display = options.map((o, i) => `  ${CYAN}${i + 1}${RESET}) ${o}`).join('\n');
    rl.question(`${question}\n${display}\n\n  ${DIM}Enter number:${RESET} `, (answer) => {
      const num = parseInt(answer.trim(), 10);
      if (num >= 1 && num <= options.length) {
        resolve(num - 1);
      } else {
        resolve(0); // Default to first
      }
    });
  });
}

/**
 * Run the interactive onboarding flow in the terminal.
 * Returns the identity ID of the created agent.
 */
export async function runInteractiveOnboarding(
  db: DrizzleDB,
  provider: EmbeddingProvider,
  rl: Interface,
  presetsDir?: string,
): Promise<string> {
  console.log();
  console.log(`${BOLD}Welcome to neo-agent!${RESET}`);
  console.log(`${DIM}Let's set up your assistant. This takes about 30 seconds.${RESET}`);
  console.log();

  // Step 1: User profile
  const name = await ask(rl, `${BOLD}What's your name?${RESET} `);
  const role = await ask(rl, `${BOLD}What do you do?${RESET} (e.g., Software Engineer, PM, Researcher) `);

  const useIdx = await askChoice(rl, `\n${BOLD}What will you primarily use this for?${RESET}`, [
    'Coding & Development',
    'Project Management',
    'Research & Analysis',
    'Writing & Documentation',
    'General Productivity',
  ]);
  const useLabels = ['Coding', 'Project Management', 'Research', 'Writing', 'Productivity'];
  const primaryUse = useLabels[useIdx];

  const styleIdx = await askChoice(rl, `\n${BOLD}How do you prefer communication?${RESET}`, [
    'Concise — short, direct answers',
    'Detailed — thorough explanations',
  ]);
  const communicationStyle = styleIdx === 0 ? 'concise' as const : 'detailed' as const;

  const toolsInput = await ask(rl, `\n${BOLD}What tools do you use daily?${RESET} ${DIM}(comma-separated, or press Enter to skip)${RESET} `);
  const tools = toolsInput ? toolsInput.split(',').map(t => t.trim()).filter(Boolean) : [];

  // Step 2: Agent selection
  console.log();
  const presetOptions = AVAILABLE_PRESETS.map(p => `${BOLD}${p.name}${RESET} — ${p.description}`);
  presetOptions.push(`${BOLD}Custom${RESET} — Start with a blank identity`);

  const agentIdx = await askChoice(rl, `${BOLD}Choose your assistant's personality:${RESET}`, presetOptions);
  const presetNames = [...AVAILABLE_PRESETS.map(p => p.name.toLowerCase()), 'custom'];
  const agentPreset = presetNames[agentIdx];

  // Step 3: Process
  console.log();
  console.log(`${DIM}Setting up your assistant...${RESET}`);

  const result = await processOnboarding(db, provider, {
    name: name || 'User',
    role: role || 'Professional',
    primaryUse,
    communicationStyle,
    tools,
  }, agentPreset, presetsDir);

  const selectedName = agentIdx < AVAILABLE_PRESETS.length
    ? AVAILABLE_PRESETS[agentIdx].name
    : 'Custom Assistant';

  console.log();
  console.log(`${GREEN}✓${RESET} ${BOLD}${selectedName}${RESET} is ready!`);
  console.log(`${DIM}  ${result.factCount} preferences stored · Identity created${RESET}`);
  console.log();

  return result.identityId;
}
