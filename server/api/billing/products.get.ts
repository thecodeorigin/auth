export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  if (!isPolarConfigured())
    return { polarConfigured: false, products: {} as Record<string, string> }
  // catalog plan slug → Polar product id, resolved live from the Polar API (by name).
  return { polarConfigured: true, products: await polarProductMapByPlanSlug() }
})
