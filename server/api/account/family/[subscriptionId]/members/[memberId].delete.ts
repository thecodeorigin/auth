export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  const memberId = getRouterParam(event, 'memberId')!
  await requireOwnedSubscription(event, subscriptionId, user.id)
  const removed = await familyRemoveMember(subscriptionId, memberId)
  if (!removed)
    throw createError({ statusCode: 400, statusMessage: 'Cannot remove this member' })
  return { ok: true }
})
