import { db } from '@nuxthub/db'
import { access } from '@nuxthub/db/schema'
import { and, eq } from 'drizzle-orm'
import { randomToken } from '../utils/nanoid'

/** Target user must already be a member of the org before an access row is created. */
async function assertMember(organizationId: string, userId: string): Promise<void> {
  const m = await db.query.member.findFirst({
    where: (x, { and: a, eq: e }) => a(e(x.organizationId, organizationId), e(x.userId, userId)),
  })
  if (!m)
    throw createError({ statusCode: 404, statusMessage: 'User is not a member of this organization' })
}

export async function accessSet(input: {
  organizationId: string
  userId: string
  clientId: string
  role: string | null
}): Promise<void> {
  await assertMember(input.organizationId, input.userId)
  await db.insert(access).values({
    id: `mas-${randomToken(16)}`,
    organizationId: input.organizationId,
    userId: input.userId,
    clientId: input.clientId,
    role: input.role ?? null,
    createdAt: new Date(),
  }).onConflictDoUpdate({
    target: [access.organizationId, access.userId, access.clientId],
    set: { role: input.role ?? null },
  })
}

export async function accessList(organizationId: string, userId: string) {
  return db.query.access.findMany({
    where: (s, { and: a, eq: e }) => a(e(s.organizationId, organizationId), e(s.userId, userId)),
  })
}

export async function accessRevoke(organizationId: string, userId: string, clientId: string): Promise<void> {
  await db.delete(access).where(and(
    eq(access.organizationId, organizationId),
    eq(access.userId, userId),
    eq(access.clientId, clientId),
  ))
}

/**
 * Grant a user ALL-apps access ('*') in an org. Default-closed model: the owner/creator
 * needs this row to access their own org. Deterministic id → idempotent under concurrency.
 */
export async function accessGrantAll(organizationId: string, userId: string): Promise<void> {
  await db.insert(access).values({
    id: `mas-all-${organizationId}-${userId}`,
    organizationId,
    userId,
    clientId: '*',
    role: null,
    createdAt: new Date(),
  }).onConflictDoNothing({ target: access.id })
}

/** D1 has no FK cascade — clear a member's grants when removing the membership (H-2). */
export async function accessClearMember(organizationId: string, userId: string): Promise<void> {
  await db.delete(access).where(
    and(eq(access.organizationId, organizationId), eq(access.userId, userId)),
  )
}

/** D1 has no FK cascade — clear ALL grants in an org when the org is deleted (H-2). */
export async function accessClearOrg(organizationId: string): Promise<void> {
  await db.delete(access).where(eq(access.organizationId, organizationId))
}
