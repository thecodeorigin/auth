export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  const memberId = getRouterParam(event, 'memberId')!
  const sub = await requireOwnedSubscription(event, subscriptionId, user.id)
  const removed = await familyRemoveMember(sub, memberId)
  if (!removed)
    throw createError({ statusCode: 400, statusMessage: 'Cannot remove this member' })
  return { ok: true }
})
