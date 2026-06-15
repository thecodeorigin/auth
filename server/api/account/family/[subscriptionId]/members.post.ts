import { z } from 'zod'

const bodySchema = z.object({ email: z.string().email() })

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  const { email } = await readValidatedBody(event, bodySchema.parse)
  const sub = await requireOwnedSubscription(event, subscriptionId, user.id)

  const result = await familyAddMember(sub, email)
  switch (result) {
    case 'duplicate':
      throw createError({ statusCode: 409, statusMessage: 'This person is already a member' })
    case 'not_seatable':
      throw createError({ statusCode: 409, statusMessage: 'This plan does not support additional seats' })
    case 'billing_unavailable':
      throw createError({ statusCode: 503, statusMessage: 'Billing is temporarily unavailable — try again shortly' })
    default:
      return { ok: true, charged: result === 'charged' } // 'added' | 'charged'
  }
})
