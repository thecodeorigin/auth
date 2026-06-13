import { revokeAppScopeParamsSchema } from '#shared/schemas/app-scope'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { orgId, userId, clientId } = await getValidatedRouterParams(event, revokeAppScopeParamsSchema.parse)
  await assertOrgAdmin(orgId, user.id)
  await revokeMemberAppScope(orgId, userId, clientId)
  return { ok: true }
})
