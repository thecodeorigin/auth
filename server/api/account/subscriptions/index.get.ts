export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  return subscriptionListForUser(user.id) // SubscriptionRow[]
})
