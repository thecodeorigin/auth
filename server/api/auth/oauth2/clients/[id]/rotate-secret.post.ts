export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const clientId = getRouterParam(event, 'id')
  if (!clientId)
    throw createError({ statusCode: 400, statusMessage: 'Missing client id' })

  const ctx = await serverAuth(event).$context
  const result = await clientRotateSecret(ctx.adapter, clientId)

  if (result === null)
    throw createError({ statusCode: 404, statusMessage: 'Client not found' })
  if (result === 'public')
    throw createError({ statusCode: 400, statusMessage: 'Public clients have no secret to rotate' })

  return result
})
