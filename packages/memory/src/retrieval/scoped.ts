import type { AccessScope } from '@neo-agent/shared';

export interface ScopeFilter {
  agentId: string;
  projectId?: string;
}

export function filterByScope<T extends { scope: AccessScope; projectId?: string | null; ownerAgent?: string | null }>(
  items: T[],
  filter: ScopeFilter,
): T[] {
  return items.filter(item => {
    if (item.scope === 'global') return true;
    if (item.scope === 'team') return filter.projectId != null && item.projectId === filter.projectId;
    if (item.scope === 'private') return item.ownerAgent === filter.agentId;
    return false;
  });
}
