export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const clientId = getRouterParam(event, 'id')
  if (!clientId)
    throw createError({ statusCode: 400, statusMessage: 'Missing client id' })

  const ctx = await serverAuth(event).$context
  const deleted = await clientDelete(ctx.adapter, clientId)

  if (!deleted)
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })

  return { ok: true }
})
