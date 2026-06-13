import { orgMemberParamsSchema } from '#shared/schemas/app-scope'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { orgId, userId } = await getValidatedRouterParams(event, orgMemberParamsSchema.parse)
  await assertOrgAdmin(orgId, user.id)
  return listMemberAppScopes(orgId, userId)
})
