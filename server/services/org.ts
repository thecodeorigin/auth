import { db } from '@nuxthub/db'
import { member, organization, user } from '@nuxthub/db/schema'
import { eq } from 'drizzle-orm'
import { accessGrantAll } from './access'

const ADMIN_ROLES = new Set(['owner', 'admin'])

/** organization.metadata is plain TEXT (not json mode) — always parse defensively. */
export function orgParseMeta(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object')
    return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    }
    catch {
      return {}
    }
  }
  return {}
}

/** Caller must be owner|admin IN THE TARGET org (orgId), not their active org (fixes IDOR H-4). */
export async function orgAssertAdmin(organizationId: string, callerUserId: string): Promise<void> {
  const m = await db.query.member.findFirst({
    where: (x, { and: a, eq: e }) => a(e(x.organizationId, organizationId), e(x.userId, callerUserId)),
  })
  if (!m || !ADMIN_ROLES.has(m.role))
    throw createError({ statusCode: 403, statusMessage: 'Not an admin of this organization' })
}

/**
 * Provision the personal org for a user — ONLY after they are verified.
 * Idempotent, concurrency-safe, re-read-free (deterministic ids). Fast-paths once the org exists.
 */
export async function orgEnsurePersonal(userId: string): Promise<void> {
  const orgId = `org-u-${userId}`

  const existing = await db.query.organization.findFirst({ where: eq(organization.id, orgId) })
  if (existing)
    return

  const u = await db.query.user.findFirst({ where: eq(user.id, userId) })
  if (!u?.emailVerified)
    return

  const now = new Date()
  await db.insert(organization).values({
    id: orgId,
    name: 'Personal',
    slug: `u-${userId}`,
    metadata: JSON.stringify({ personal: true }),
    createdAt: now,
  }).onConflictDoNothing({ target: organization.id })

  await db.insert(member).values({
    id: `mem-${orgId}-${userId}`,
    organizationId: orgId,
    userId,
    role: 'owner',
    createdAt: now,
  }).onConflictDoNothing({ target: member.id })

  // default-closed: owner needs an explicit all-apps grant to access their own org
  await accessGrantAll(orgId, userId)
}
