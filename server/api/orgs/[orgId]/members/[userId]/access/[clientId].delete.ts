import { AccessRevokeParamsSchema } from '#shared/schemas/access'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { orgId, userId, clientId } = await getValidatedRouterParams(event, AccessRevokeParamsSchema.parse)
  await orgAssertAdmin(orgId, user.id)
  await accessRevoke(orgId, userId, clientId)
  return { ok: true }
})
