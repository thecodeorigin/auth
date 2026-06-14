export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const subscriptionId = getRouterParam(event, 'subscriptionId')!
  await requireOwnedSubscription(event, subscriptionId, user.id) // owner-only view of seats
  return familyMembers(subscriptionId)
})
