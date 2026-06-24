import type { FamilyMember, SubscriptionRow } from '#shared/subscription'
import { db } from '@nuxthub/db'
import { subscription, subscriptionMember } from '@nuxthub/db/schema'
import { and, eq, ne, sql } from 'drizzle-orm'
import { planBySlug } from '#shared/catalog'
import { polarSetSeats } from './polar'

export type AddSeatResult = 'added' | 'charged' | 'duplicate' | 'billing_unavailable' | 'not_seatable'

function rowsAffected(res: unknown): number {
  return (res as { rowsAffected?: number, changes?: number }).rowsAffected
    ?? (res as { changes?: number }).changes ?? 0
}

export async function familyMembers(subscriptionId: string): Promise<FamilyMember[]> {
  const rows = await db.select().from(subscriptionMember).where(eq(subscriptionMember.subscriptionId, subscriptionId))
  return rows
    .map(r => ({ id: r.id, email: r.email, userId: r.userId, status: r.status as FamilyMember['status'], createdAt: r.createdAt.getTime() }))
    .sort((a, b) => (a.status === 'owner' ? -1 : b.status === 'owner' ? 1 : a.createdAt - b.createdAt))
}

async function insertMember(id: string, subscriptionId: string, email: string, userId: string | null, status: string): Promise<void> {
  await db.insert(subscriptionMember).values({ id, subscriptionId, email, userId, status, createdAt: new Date() }).onConflictDoNothing()
}

/**
 * Add a member ("Add seat"), fill-or-grow:
 *  - if a pre-paid seat is free (count < capacity) → fill it, NO charge → 'added'
 *  - if full → grow capacity by 1:
 *      • real paid seat-based sub → Polar proration charge → 'charged'
 *      • real sub but plan not seat-capable → 'not_seatable' (no change)
 *      • real sub but Polar unconfigured/failed → 'billing_unavailable' (no change)
 *      • seeded/demo sub → grow capacity locally, NO charge → 'added'
 * Caller must have verified ownership (route does via requireOwnedSubscription).
 */
export async function familyAddMember(sub: SubscriptionRow, email: string): Promise<AddSeatResult> {
  const normEmail = email.trim().toLowerCase()

  const [dupe] = await db.select({ id: subscriptionMember.id }).from(subscriptionMember).where(and(eq(subscriptionMember.subscriptionId, sub.id), eq(subscriptionMember.email, normEmail))).limit(1)
  if (dupe)
    return 'duplicate'

  const existingUser = await db.query.user.findFirst({ where: (u, { eq: e }) => e(u.email, normEmail) })
  const status = existingUser ? 'member' : 'invited'
  const id = `fam-${crypto.randomUUID()}`

  // 1) Fill a free pre-paid seat atomically (count < capacity) — no charge.
  const filled = await db.run(sql`
    INSERT INTO subscriptionMember (id, subscriptionId, email, userId, status, createdAt)
    SELECT ${id}, ${sub.id}, ${normEmail}, ${existingUser?.id ?? null}, ${status},
           (cast(unixepoch('subsecond') * 1000 as integer))
    WHERE (SELECT count(*) FROM subscriptionMember WHERE subscriptionId = ${sub.id}) < ${sub.seats}
  `)
  if (rowsAffected(filled) > 0)
    return 'added'

  // 2) Full → grow capacity by 1.
  const seatCapable = (planBySlug(sub.planSlug)?.seats ?? 1) > 1
  const realPolar = sub.source === 'polar' && !!sub.polarSubscriptionId

  if (realPolar) {
    if (!seatCapable)
      return 'not_seatable'
    const newSeats = await polarSetSeats(sub.polarSubscriptionId!, sub.seats + 1)
    if (newSeats == null)
      return 'billing_unavailable'
    await db.update(subscription).set({ seats: newSeats, updatedAt: new Date() }).where(eq(subscription.id, sub.id))
    await insertMember(id, sub.id, normEmail, existingUser?.id ?? null, status)
    return 'charged'
  }

  // Seeded/demo sub → grow capacity locally, no charge.
  await db.update(subscription).set({ seats: sub.seats + 1, updatedAt: new Date() }).where(eq(subscription.id, sub.id))
  await insertMember(id, sub.id, normEmail, existingUser?.id ?? null, status)
  return 'added'
}

/** Remove a member (never the owner) and shrink paid capacity to match (never below 1). */
export async function familyRemoveMember(sub: SubscriptionRow, memberId: string): Promise<boolean> {
  const [m] = await db.select().from(subscriptionMember).where(and(eq(subscriptionMember.id, memberId), eq(subscriptionMember.subscriptionId, sub.id))).limit(1)
  if (!m || m.status === 'owner')
    return false
  await db.delete(subscriptionMember).where(eq(subscriptionMember.id, memberId))

  if (sub.seats > 1) {
    const target = Math.max(1, sub.seats - 1)
    if (sub.source === 'polar' && sub.polarSubscriptionId) {
      const newSeats = await polarSetSeats(sub.polarSubscriptionId, target)
      if (newSeats != null)
        await db.update(subscription).set({ seats: newSeats, updatedAt: new Date() }).where(eq(subscription.id, sub.id))
    }
    else {
      await db.update(subscription).set({ seats: target, updatedAt: new Date() }).where(eq(subscription.id, sub.id))
    }
  }
  return true
}

/** Seed reconcile: drop all non-owner members so re-seeding is deterministic. */
export async function familyClearNonOwner(subscriptionId: string): Promise<void> {
  await db.delete(subscriptionMember).where(and(eq(subscriptionMember.subscriptionId, subscriptionId), ne(subscriptionMember.status, 'owner')))
}

/** Seed helper: upsert the owner seat for a subscription. */
export async function familyEnsureOwner(subscriptionId: string, email: string, userId: string): Promise<void> {
  await db.insert(subscriptionMember)
    .values({ id: `fam-owner-${subscriptionId}`, subscriptionId, email: email.toLowerCase(), userId, status: 'owner', createdAt: new Date() })
    .onConflictDoNothing()
}
