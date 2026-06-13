import { AccessSetBodySchema, OrgMemberParamsSchema } from '#shared/schemas/access'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const { orgId, userId } = await getValidatedRouterParams(event, OrgMemberParamsSchema.parse)
  await orgAssertAdmin(orgId, user.id)
  const body = await readValidatedBody(event, AccessSetBodySchema.parse)
  await accessSet({ organizationId: orgId, userId, clientId: body.clientId, role: body.role ?? null })
  return { ok: true }
})
