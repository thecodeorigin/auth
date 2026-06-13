import { orgMemberParamsSchema, setAppScopeBodySchema } from '#shared/schemas/app-scope'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { orgId, userId } = await getValidatedRouterParams(event, orgMemberParamsSchema.parse)
  await assertOrgAdmin(orgId, user.id)
  const body = await readValidatedBody(event, setAppScopeBodySchema.parse)
  await setMemberAppScope({ organizationId: orgId, userId, clientId: body.clientId, role: body.role ?? null })
  return { ok: true }
})
