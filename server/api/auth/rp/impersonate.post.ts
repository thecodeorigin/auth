import { db } from '@nuxthub/db'
import { z } from 'zod'
import { abilitiesForRole } from '#shared/permissions'
import { claimsResolve, claimsResolveAll } from '../../../services/claims'
import { entitlementsResolve } from '../../../services/entitlements'
import { isSystemAdmin, mintImpersonationToken, requireOAuthToken } from '../../../services/rp'

const bodySchema = z.object({ userId: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const caller = await requireOAuthToken(event)
  if (caller.isImpersonation)
    throw createError({ statusCode: 403, statusMessage: 'Cannot chain impersonation' })
  if (!(await isSystemAdmin(caller.userId)))
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })

  const { userId: targetId } = await readValidatedBody(event, bodySchema.parse)
  if (targetId === caller.userId)
    throw createError({ statusCode: 400, statusMessage: 'Cannot impersonate yourself' })
  if (await isSystemAdmin(targetId))
    throw createError({ statusCode: 403, statusMessage: 'Cannot impersonate an administrator' })

  const target = await db.query.user.findFirst({ where: (x, { eq }) => eq(x.id, targetId) })
  if (!target)
    throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const minted = await mintImpersonationToken(caller.userId, targetId, caller.clientId)
  const [claims, organizations, entitlement] = await Promise.all([
    claimsResolve(targetId, caller.clientId),
    claimsResolveAll(targetId, caller.clientId),
    entitlementsResolve(targetId, caller.clientId),
  ])
  return {
    accessToken: minted.token,
    expiresAt: minted.expiresAt.getTime(),
    user: {
      sub: target.id,
      email: target.email,
      name: target.name,
      picture: (target as { image?: string | null }).image ?? null,
      email_verified: true,
    },
    claims: {
      ...claims,
      organizations,
      abilities: abilitiesForRole(claims.roles),
      role: null as string | null,
      entitlement,
    },
  }
})
