import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { EntityContainerLink } from '@neo-agent/shared';
import { entityContainers } from '../schema/entity-containers.js';

function toLink(row: typeof entityContainers.$inferSelect): EntityContainerLink {
  return {
    id: row.id,
    entityId: row.entityId,
    containerId: row.containerId,
    role: row.role,
    addedAt: row.addedAt,
  };
}

export function link(db: DrizzleDB, entityId: string, containerId: string, role?: string): EntityContainerLink {
  const row = {
    id: randomUUID(),
    entityId,
    containerId,
    role: role ?? null,
    addedAt: new Date().toISOString(),
  };
  db.insert(entityContainers).values(row).run();
  return toLink(row);
}

export function unlink(db: DrizzleDB, entityId: string, containerId: string): void {
  db.delete(entityContainers)
    .where(and(eq(entityContainers.entityId, entityId), eq(entityContainers.containerId, containerId)))
    .run();
}

export function listByEntity(db: DrizzleDB, entityId: string): EntityContainerLink[] {
  return db.select().from(entityContainers).where(eq(entityContainers.entityId, entityId)).all().map(toLink);
}

export function listByContainer(db: DrizzleDB, containerId: string): EntityContainerLink[] {
  return db.select().from(entityContainers).where(eq(entityContainers.containerId, containerId)).all().map(toLink);
}
