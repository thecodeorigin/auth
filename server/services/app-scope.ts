import { db } from '@nuxthub/db'
import { memberAppScope } from '@nuxthub/db/schema'
import { and, eq } from 'drizzle-orm'
import { randomToken } from '../utils/nanoid'

const ADMIN_ROLES = new Set(['owner', 'admin'])

/** Caller must be owner|admin IN THE TARGET org (orgId), not their active org (fixes IDOR H-4). */
export async function assertOrgAdmin(organizationId: string, callerUserId: string): Promise<void> {
  const m = await db.query.member.findFirst({
    where: (x, { and: a, eq: e }) => a(e(x.organizationId, organizationId), e(x.userId, callerUserId)),
  })
  if (!m || !ADMIN_ROLES.has(m.role))
    throw createError({ statusCode: 403, statusMessage: 'Not an admin of this organization' })
}

/** Target user must already be a member of the org before a scope row is created. */
async function assertTargetIsMember(organizationId: string, userId: string): Promise<void> {
  const m = await db.query.member.findFirst({
    where: (x, { and: a, eq: e }) => a(e(x.organizationId, organizationId), e(x.userId, userId)),
  })
  if (!m)
    throw createError({ statusCode: 404, statusMessage: 'User is not a member of this organization' })
}

export async function setMemberAppScope(input: {
  organizationId: string
  userId: string
  clientId: string
  role: string | null
}): Promise<void> {
  await assertTargetIsMember(input.organizationId, input.userId)
  await db.insert(memberAppScope).values({
    id: `mas-${randomToken(16)}`,
    organizationId: input.organizationId,
    userId: input.userId,
    clientId: input.clientId,
    role: input.role ?? null,
    createdAt: new Date(),
  }).onConflictDoUpdate({
    target: [memberAppScope.organizationId, memberAppScope.userId, memberAppScope.clientId],
    set: { role: input.role ?? null },
  })
}

export async function listMemberAppScopes(organizationId: string, userId: string) {
  return db.query.memberAppScope.findMany({
    where: (s, { and: a, eq: e }) => a(e(s.organizationId, organizationId), e(s.userId, userId)),
  })
}

export async function revokeMemberAppScope(organizationId: string, userId: string, clientId: string): Promise<void> {
  await db.delete(memberAppScope).where(and(
    eq(memberAppScope.organizationId, organizationId),
    eq(memberAppScope.userId, userId),
    eq(memberAppScope.clientId, clientId),
  ))
}
