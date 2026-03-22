import type { SessionSummary } from '../stages/01-episodic-replay.js';

export function buildSkillSynthesisPrompt(
  taskTitle: string,
  toolsUsed: string[],
  sessionContent: string,
): string {
  return `A multi-step task was completed successfully.

Task: ${taskTitle}
Tools used: ${toolsUsed.join(', ')}
Session content:
${sessionContent.slice(0, 3000)}

Extract the procedure as a reusable skill:
- name: short name for this procedure
- description: one sentence
- steps: numbered list of what was done
- tools: which tools are required
- category: one of [devops, debugging, setup, workflow, data, documentation]
- tags: relevant keywords

Return ONLY a JSON object (not an array).`;
}

export function formatSkillMarkdown(skill: {
  name: string;
  description: string;
  steps: string[];
  tools: string[];
  tags: string[];
}): string {
  const stepsText = skill.steps.map((s, i) => `${i + 1}. ${s}`).join('\n');
  const toolsText = skill.tools.map(t => `- ${t}`).join('\n');

  return `# ${skill.name}

${skill.description}

## Steps

${stepsText}

## Tools Required

${toolsText}

## Tags

${skill.tags.join(', ')}
`;
}
