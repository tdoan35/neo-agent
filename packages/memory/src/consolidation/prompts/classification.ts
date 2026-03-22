import type { Container } from '@neo-agent/shared';
import type { SessionSummary } from '../stages/01-episodic-replay.js';

export function buildClassificationPrompt(
  sessions: SessionSummary[],
  existingContainers: Container[],
): string {
  const containerList = existingContainers.length > 0
    ? existingContainers.map(c => `- "${c.name}" (${c.paraType}, ${c.status})`).join('\n')
    : '(none)';

  const sessionSummaries = sessions.map(s => {
    const turnText = s.turns.slice(0, 20).map(t =>
      `  [${t.role}${t.toolName ? ` (${t.toolName})` : ''}]: ${t.content.slice(0, 200)}`
    ).join('\n');
    return `Session ${s.sessionId} (agent: ${s.agentId}):\n${turnText}`;
  }).join('\n\n');

  return `You are analyzing conversation sessions to extract and classify knowledge.

Existing PARA containers:
${containerList}

Sessions:
${sessionSummaries}

For each notable item in the sessions, extract and classify:
- content: the fact/decision/observation text (concise)
- type: one of [preference, decision, convention, status, capability, biographical, environmental, observation, lesson_learned]
- containerName: which PARA container this belongs to (use existing name or suggest a new one)
- entityName: if related to a specific entity (person, tool, service), name it
- entityType: one of [person, project, tool, service, concept, codebase, organization, framework] (if entityName given)
- confidence: 0.0-1.0

Return ONLY a JSON array. If nothing notable, return [].`;
}
