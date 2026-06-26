import { z } from 'zod'
import { impersonatableUsersPage, isSystemAdmin, requireOAuthToken } from '../../../services/rp'

const querySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.coerce.number().min(1).max(50).default(20),
  offset: z.coerce.number().min(0).default(0),
})

export default defineEventHandler(async (event) => {
  const caller = await requireOAuthToken(event)
  if (caller.isImpersonation || !(await isSystemAdmin(caller.userId)))
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  const { q, limit, offset } = await getValidatedQuery(event, querySchema.parse)
  return impersonatableUsersPage(caller.userId, q, limit, offset)
})
