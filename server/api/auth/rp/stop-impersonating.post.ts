import { requireOAuthToken, revokeImpersonationToken } from '../../../services/rp'

export default defineEventHandler(async (event) => {
  const caller = await requireOAuthToken(event)
  if (!caller.isImpersonation)
    throw createError({ statusCode: 400, statusMessage: 'Not an impersonation token' })
  await revokeImpersonationToken(caller)
  return { ok: true }
})
