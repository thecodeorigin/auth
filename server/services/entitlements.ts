import type { SubscriptionStatus } from '#shared/subscription'
import { db } from '@nuxthub/db'
import { subscription } from '@nuxthub/db/schema'
import { eq } from 'drizzle-orm'
import { planBySlug, productByClientName } from '#shared/catalog'
import { isActive } from '#shared/subscription'

export interface Entitlement {
  product: string // product slug
  plan: string // plan slug
  status: string
  active: boolean
  currentPeriodEnd: number | null
}

/**
 * Resolve the REQUESTING client's product entitlement for a user, live (per userinfo call).
 * clientId → oauthClient.name → catalog product → user's newest subscription for that product.
 * Returns null when the requesting client maps to no catalog product, or the user owns nothing.
 */
export async function entitlementsResolve(userId: string, clientId?: string | null): Promise<Entitlement | null> {
  if (!clientId)
    return null
  try {
    const client = await db.query.oauthClient.findFirst({ where: (c, { eq: e }) => e(c.clientId, clientId) })
    if (!client?.name)
      return null
    const product = productByClientName(client.name)
    if (!product)
      return null

    const subs = await db.select().from(subscription).where(eq(subscription.userId, userId))
    const owned = subs
      .map(s => ({ s, plan: planBySlug(s.planSlug) }))
      .filter(x => x.plan?.productSlug === product.slug)
      .sort((a, b) => b.s.createdAt.getTime() - a.s.createdAt.getTime())
    const top = owned[0]
    if (!top)
      return null

    const cpe = top.s.currentPeriodEnd ? top.s.currentPeriodEnd.getTime() : null
    return {
      product: product.slug,
      plan: top.s.planSlug,
      status: top.s.status,
      active: isActive({ status: top.s.status as SubscriptionStatus, currentPeriodEnd: cpe }),
      currentPeriodEnd: cpe,
    }
  }
  catch (error) {
    console.error('[billing] entitlementsResolve failed', userId, clientId, error)
    return null
  }
}
