import { z } from 'zod'

const bodySchema = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  const { email } = await readValidatedBody(event, bodySchema.parse)
  const sub = await requireOwnedSubscription(event, subscriptionId, user.id)

  const result = await familyAddMember(subscriptionId, sub.planSlug, email)
  if (result === 'full')
    throw createError({ statusCode: 409, statusMessage: 'All seats are taken' })
  if (result === 'duplicate')
    throw createError({ statusCode: 409, statusMessage: 'Already a member' })
  return { ok: true }
})
