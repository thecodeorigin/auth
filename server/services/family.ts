import type { FamilyMember, FamilyMemberStatus } from '#shared/subscription'
import { db } from '@nuxthub/db'
import { subscriptionMember } from '@nuxthub/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { planBySlug } from '#shared/catalog'

export async function familyMembers(subscriptionId: string): Promise<FamilyMember[]> {
  const rows = await db.select().from(subscriptionMember).where(eq(subscriptionMember.subscriptionId, subscriptionId))
  return rows
    .map(r => ({ id: r.id, email: r.email, userId: r.userId, status: r.status as FamilyMemberStatus, createdAt: r.createdAt.getTime() }))
    .sort((a, b) => (a.status === 'owner' ? -1 : b.status === 'owner' ? 1 : a.createdAt - b.createdAt))
}

/**
 * Add a seat. Caller MUST already be verified as the subscription owner (route does this).
 * Seat cap enforced by a count-gated conditional insert — no TOCTOU. If a verified
 * user with this email exists, bind userId + status 'member'; else 'invited'.
 * Returns 'added' | 'full' | 'duplicate'.
 */
export async function familyAddMember(subscriptionId: string, planSlug: string, email: string): Promise<'added' | 'full' | 'duplicate'> {
  const seats = planBySlug(planSlug)?.seats ?? 1
  const normEmail = email.trim().toLowerCase()

  // Duplicate guard (UNIQUE also enforces this at the DB level).
  const [dupe] = await db.select({ id: subscriptionMember.id }).from(subscriptionMember).where(and(eq(subscriptionMember.subscriptionId, subscriptionId), eq(subscriptionMember.email, normEmail))).limit(1)
  if (dupe)
    return 'duplicate'

  // Resolve an existing user by email (verified accounts only become 'member').
  const existingUser = await db.query.user.findFirst({ where: (u, { eq: e }) => e(u.email, normEmail) })

  // Conditional insert: only succeeds while seat count < cap. INSERT...SELECT is
  // evaluated atomically per statement in SQLite/D1 → no count-then-insert race.
  const id = `fam-${crypto.randomUUID()}`
  const status: FamilyMemberStatus = existingUser ? 'member' : 'invited'
  const res = await db.run(sql`
    INSERT INTO subscriptionMember (id, subscriptionId, email, userId, status, createdAt)
    SELECT ${id}, ${subscriptionId}, ${normEmail}, ${existingUser?.id ?? null}, ${status},
           (cast(unixepoch('subsecond') * 1000 as integer))
    WHERE (SELECT count(*) FROM subscriptionMember WHERE subscriptionId = ${subscriptionId}) < ${seats}
  `)
  // d1/libsql expose rowsAffected on the run result.
  const affected = (res as { rowsAffected?: number, changes?: number }).rowsAffected
    ?? (res as { changes?: number }).changes ?? 0
  return affected > 0 ? 'added' : 'full'
}

export async function familyRemoveMember(subscriptionId: string, memberId: string): Promise<boolean> {
  // Never allow removing the owner row.
  const [m] = await db.select().from(subscriptionMember).where(and(eq(subscriptionMember.id, memberId), eq(subscriptionMember.subscriptionId, subscriptionId))).limit(1)
  if (!m || m.status === 'owner')
    return false
  await db.delete(subscriptionMember).where(eq(subscriptionMember.id, memberId))
  return true
}

/** Seed helper: upsert the owner seat for a subscription. */
export async function familyEnsureOwner(subscriptionId: string, email: string, userId: string): Promise<void> {
  await db.insert(subscriptionMember)
    .values({ id: `fam-owner-${subscriptionId}`, subscriptionId, email: email.toLowerCase(), userId, status: 'owner', createdAt: new Date() })
    .onConflictDoNothing()
}
