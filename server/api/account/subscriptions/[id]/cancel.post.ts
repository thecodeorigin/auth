import { z } from 'zod'

const bodySchema = z.object({ cancel: z.boolean().default(true) })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const id = getRouterParam(event, 'id')!
  const { cancel } = await readValidatedBody(event, bodySchema.parse)
  const sub = await requireOwnedSubscription(event, id, user.id)

  // Seeded (local-only) subs never touch Polar.
  if (sub.source === 'polar' && sub.polarSubscriptionId) {
    if (!isPolarConfigured())
      throw createError({ statusCode: 503, statusMessage: 'Billing temporarily unavailable' })
    // Authoritative cancel happens in the Polar customer portal; here we only
    // record intent so the dashboard reflects it immediately. The webhook will
    // reconcile the real state. (Direct Polar cancel API can be added later.)
  }
  await subscriptionSetCancelAtPeriodEnd(id, cancel)
  return { ok: true }
})
