import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { DrizzleDB } from '../db.js';
import type { AgentIdentity } from '@neo-agent/shared';
import { NotFoundError } from '@neo-agent/shared';
import { identities } from '../schema/identities.js';

export interface CreateIdentityInput {
  name: string;
  role: string;
  tone: string;
  avatar: { color: string; letter: string };
  persona: string;
  boundaries?: string[];
  soulPath: string;
  isPreset?: boolean;
  createdFrom?: string;
}

function toIdentity(row: typeof identities.$inferSelect): AgentIdentity {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    tone: row.tone,
    avatar: JSON.parse(row.avatar) as { color: string; letter: string },
    persona: row.persona,
    boundaries: JSON.parse(row.boundaries) as string[],
    soulPath: row.soulPath,
    isPreset: row.isPreset,
    createdFrom: row.createdFrom,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createIdentity(db: DrizzleDB, input: CreateIdentityInput): AgentIdentity {
  const now = new Date().toISOString();
  const row = {
    id: randomUUID(),
    name: input.name,
    role: input.role,
    tone: input.tone,
    avatar: JSON.stringify(input.avatar),
    persona: input.persona,
    boundaries: JSON.stringify(input.boundaries ?? []),
    soulPath: input.soulPath,
    isPreset: input.isPreset ?? false,
    createdFrom: input.createdFrom ?? null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(identities).values(row).run();
  return toIdentity(row);
}

export function getIdentity(db: DrizzleDB, id: string): AgentIdentity {
  const row = db.select().from(identities).where(eq(identities.id, id)).get();
  if (!row) throw new NotFoundError('Identity', id);
  return toIdentity(row);
}

export function getIdentityByName(db: DrizzleDB, name: string): AgentIdentity | null {
  const row = db.select().from(identities).where(eq(identities.name, name)).get();
  return row ? toIdentity(row) : null;
}

export function listIdentities(db: DrizzleDB): AgentIdentity[] {
  return db.select().from(identities).all().map(toIdentity);
}

export function listPresets(db: DrizzleDB): AgentIdentity[] {
  return db.select().from(identities).where(eq(identities.isPreset, true)).all().map(toIdentity);
}

export function updateIdentity(db: DrizzleDB, id: string, updates: Partial<CreateIdentityInput>): AgentIdentity {
  const now = new Date().toISOString();
  const setValues: Record<string, unknown> = { updatedAt: now };
  if (updates.name !== undefined) setValues.name = updates.name;
  if (updates.role !== undefined) setValues.role = updates.role;
  if (updates.tone !== undefined) setValues.tone = updates.tone;
  if (updates.avatar !== undefined) setValues.avatar = JSON.stringify(updates.avatar);
  if (updates.persona !== undefined) setValues.persona = updates.persona;
  if (updates.boundaries !== undefined) setValues.boundaries = JSON.stringify(updates.boundaries);
  if (updates.soulPath !== undefined) setValues.soulPath = updates.soulPath;

  db.update(identities).set(setValues).where(eq(identities.id, id)).run();
  return getIdentity(db, id);
}
