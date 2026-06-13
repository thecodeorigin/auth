import { db } from '@nuxthub/db'
import { member, memberAppScope, organization, user } from '@nuxthub/db/schema'
import { and, eq } from 'drizzle-orm'

/** organization.metadata is plain TEXT (not json mode) — always parse defensively. */
export function parseOrgMeta(raw: unknown): Record<string, unknown> {
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

/**
 * Grant a user ALL-apps access ('*') in an org. Default-closed model: the org owner/creator
 * needs this row to access their own org. Deterministic id → idempotent under concurrency.
 */
export async function grantAllAppsScope(organizationId: string, userId: string): Promise<void> {
  await db.insert(memberAppScope).values({
    id: `mas-all-${organizationId}-${userId}`,
    organizationId,
    userId,
    clientId: '*',
    role: null, // inherit member.role (owner)
    createdAt: new Date(),
  }).onConflictDoNothing({ target: memberAppScope.id })
}

/**
 * Provision the personal org for a user — ONLY after they are verified (open question #2).
 * Idempotent, concurrency-safe, re-read-free (deterministic ids → failure-mode M-1).
 * Fast-path returns immediately once the org exists, so the user-read only happens on first call.
 */
export async function ensurePersonalOrgIfVerified(userId: string): Promise<void> {
  const orgId = `org-u-${userId}`

  // fast path: already provisioned → no further reads/writes
  const existing = await db.query.organization.findFirst({ where: eq(organization.id, orgId) })
  if (existing)
    return

  // verified gate. (With requireEmailVerification:true a session only exists post-verification,
  // and social users are provider-verified — this is belt-and-suspenders against config drift.)
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
  await grantAllAppsScope(orgId, userId)
}

/** D1 does NOT enforce FK cascade — call this explicitly when removing a membership (failure-mode H-2). */
export async function removeMemberAppScopes(organizationId: string, userId: string): Promise<void> {
  await db.delete(memberAppScope).where(
    and(eq(memberAppScope.organizationId, organizationId), eq(memberAppScope.userId, userId)),
  )
}

/** D1 does NOT enforce FK cascade — drop ALL of an org's scope rows when the org is deleted (H-2). */
export async function removeOrgAppScopes(organizationId: string): Promise<void> {
  await db.delete(memberAppScope).where(eq(memberAppScope.organizationId, organizationId))
}
