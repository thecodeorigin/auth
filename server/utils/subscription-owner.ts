import type { H3Event } from 'h3'
import type { SubscriptionRow } from '#shared/subscription'
import { subscriptionGet } from '../services/subscription'

/** Load a subscription and assert the session user OWNS it. 404 if missing, 403 if not owner. */
export async function requireOwnedSubscription(_event: H3Event, id: string, userId: string): Promise<SubscriptionRow> {
  const sub = await subscriptionGet(id)
  if (!sub)
    throw createError({ statusCode: 404, statusMessage: 'Subscription not found' })
  if (sub.userId !== userId)
    throw createError({ statusCode: 403, statusMessage: 'Not your subscription' })
  return sub
}
