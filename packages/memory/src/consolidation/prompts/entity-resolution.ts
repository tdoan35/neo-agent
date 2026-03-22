export function buildEntityResolutionPrompt(
  newName: string,
  existingName: string,
  existingType: string,
  context: string,
): string {
  return `Is "${newName}" the same entity as "${existingName}" (${existingType})?
Context: ${context.slice(0, 500)}
Respond with ONLY "YES" or "NO" followed by a brief reason.`;
}

export function buildContradictionPrompt(
  contentA: string,
  dateA: string,
  contentB: string,
  dateB: string,
): string {
  return `Do these two facts contradict each other?
Fact A (from ${dateA}): "${contentA}"
Fact B (from ${dateB}): "${contentB}"
Respond with ONLY one of: CONTRADICTS, UPDATES, or COMPATIBLE`;
}
