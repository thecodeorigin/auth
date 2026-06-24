import type { SubscriptionRow } from '#shared/subscription'
import { db } from '@nuxthub/db'
import { subscription, subscriptionMember } from '@nuxthub/db/schema'
import { eq, sql } from 'drizzle-orm'
import { isActive } from '#shared/subscription'

function rid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

/** All subscriptions a user OWNS (referenceId model is userId-only). */
export async function subscriptionListForUser(userId: string): Promise<SubscriptionRow[]> {
  const rows = await db.select().from(subscription).where(eq(subscription.userId, userId))
  return rows.map(toRow).sort((a, b) => statusRank(a) - statusRank(b) || (b.createdAt - a.createdAt))
}

export async function subscriptionGet(id: string): Promise<SubscriptionRow | null> {
  const [row] = await db.select().from(subscription).where(eq(subscription.id, id)).limit(1)
  return row ? toRow(row) : null
}

/** Idempotent upsert used by BOTH the seed task and the Polar webhook. */
export async function subscriptionUpsert(input: {
  id?: string
  userId: string
  planSlug: string
  status: SubscriptionRow['status']
  currentPeriodEnd: number | null
  cancelAtPeriodEnd?: boolean
  seats?: number
  source: SubscriptionRow['source']
  polarSubscriptionId?: string | null
  polarCustomerId?: string | null
  updatedAt?: number
}): Promise<void> {
  const now = new Date()
  const updatedAt = new Date(input.updatedAt ?? now.getTime())
  // Deterministic id for seed idempotency: seed rows key on (userId, planSlug).
  const id = input.id
    ?? (input.source === 'seed' ? `sub-seed-${input.userId}-${input.planSlug}` : rid('sub'))

  await db.insert(subscription)
    .values({
      id,
      userId: input.userId,
      planSlug: input.planSlug,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd == null ? null : new Date(input.currentPeriodEnd),
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      seats: input.seats ?? 1,
      source: input.source,
      polarSubscriptionId: input.polarSubscriptionId ?? null,
      polarCustomerId: input.polarCustomerId ?? null,
      createdAt: now,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: {
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd == null ? null : new Date(input.currentPeriodEnd),
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        seats: input.seats ?? 1,
        polarSubscriptionId: input.polarSubscriptionId ?? null,
        polarCustomerId: input.polarCustomerId ?? null,
        updatedAt,
      },
      // STALENESS GUARD: drop out-of-order webhooks (older updatedAt loses).
      setWhere: sql`${subscription.updatedAt} < ${updatedAt.getTime()}`,
    })
}

/**
 * Webhook entry point. Maps a Polar subscription object → local row, keyed on the
 * UNIQUE polarSubscriptionId. referenceId/userId/planSlug are read from the Polar
 * subscription's metadata (set at checkout) and customer.externalId — never guessed.
 */
export async function subscriptionUpsertFromPolar(sub: {
  id: string
  status: string
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  modified_at?: string | null
  product_id: string
  seats?: number | null
  customer?: { external_id?: string | null, id?: string | null } | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  const { polarPlanSlugForProduct } = await import('./polar')
  const userId = (sub.metadata?.userId as string | undefined) ?? sub.customer?.external_id ?? null
  const planSlug = (sub.metadata?.planSlug as string | undefined) ?? await polarPlanSlugForProduct(sub.product_id)
  if (!userId || !planSlug) {
    console.warn('[billing] webhook: cannot resolve userId/planSlug', sub.id, { userId, planSlug })
    return
  }
  // Find an existing local row by polarSubscriptionId to reuse its id (upsert in place).
  const [existing] = await db.select({ id: subscription.id }).from(subscription).where(eq(subscription.polarSubscriptionId, sub.id)).limit(1)

  const status = mapPolarStatus(sub.status, sub.current_period_end)
  await subscriptionUpsert({
    id: existing?.id, // undefined → new rid('sub')
    userId,
    planSlug,
    status,
    currentPeriodEnd: sub.current_period_end ? Date.parse(sub.current_period_end) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    seats: sub.seats ?? 1,
    source: 'polar',
    polarSubscriptionId: sub.id,
    polarCustomerId: sub.customer?.id ?? null,
    updatedAt: sub.modified_at ? Date.parse(sub.modified_at) : Date.now(),
  })
}

function mapPolarStatus(s: string, periodEnd?: string | null): SubscriptionRow['status'] {
  switch (s) {
    case 'active': return periodEnd && Date.parse(periodEnd) <= Date.now() ? 'expired' : 'active'
    case 'trialing': return 'trialing'
    case 'past_due': case 'unpaid': return 'past_due'
    case 'canceled': case 'revoked': return 'canceled'
    default: return 'expired'
  }
}

/** D1 has no FK cascade at runtime — called from the user.delete hook. */
export async function subscriptionClearForUser(userId: string): Promise<void> {
  const subs = await db.select({ id: subscription.id }).from(subscription).where(eq(subscription.userId, userId))
  for (const s of subs)
    await db.delete(subscriptionMember).where(eq(subscriptionMember.subscriptionId, s.id))
  await db.delete(subscription).where(eq(subscription.userId, userId))
  // Also drop any seat rows where this user was an invitee on someone else's plan.
  await db.delete(subscriptionMember).where(eq(subscriptionMember.userId, userId))
}

function statusRank(s: SubscriptionRow): number {
  return isActive(s) ? 0 : 1 // active first
}

function toRow(r: typeof subscription.$inferSelect): SubscriptionRow {
  return {
    id: r.id,
    userId: r.userId,
    planSlug: r.planSlug,
    status: r.status as SubscriptionRow['status'],
    currentPeriodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.getTime() : null,
    cancelAtPeriodEnd: !!r.cancelAtPeriodEnd,
    seats: r.seats,
    source: r.source as SubscriptionRow['source'],
    polarSubscriptionId: r.polarSubscriptionId,
    polarCustomerId: r.polarCustomerId,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  }
}
