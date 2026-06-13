import { OrgMemberParamsSchema } from '#shared/schemas/access'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { orgId, userId } = await getValidatedRouterParams(event, OrgMemberParamsSchema.parse)
  await orgAssertAdmin(orgId, user.id)
  return accessList(orgId, userId)
})
