export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const clientId = getRouterParam(event, 'id')
  if (!clientId)
    throw createError({ statusCode: 400, statusMessage: 'Missing client id' })

  const auth = serverAuth(event)
  const ctx = await auth.$context
  const client = await clientGet(ctx.adapter, clientId)

  if (!client)
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  return client
})
