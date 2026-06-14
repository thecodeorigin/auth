export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  if (!isPolarConfigured())
    throw createError({ statusCode: 503, statusMessage: 'Billing temporarily unavailable' })
  // Ensure a Polar customer exists for this user, then return a portal session URL.
  const url = await polarPortalUrl(user.id, user.email, user.name)
  if (!url)
    throw createError({ statusCode: 502, statusMessage: 'Could not open the billing portal' })
  return { url }
})
