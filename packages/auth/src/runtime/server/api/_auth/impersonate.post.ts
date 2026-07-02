import type { AbilityRule, RpOrganization } from '../../../../contract'
import { createError, defineEventHandler, readValidatedBody } from 'h3'
import { z } from 'zod'
import { idpFetch } from '../../utils/idp'
import { newSessionId, readSessionRecord, toPublicSession, writeSessionRecord } from '../../utils/session'

const bodySchema = z.object({ userId: z.string() })

interface ImpersonateResponse {
  accessToken: string
  expiresAt: number
  user: { sub: string, email: string, name?: string | null, picture?: string | null }
  claims: { abilities: AbilityRule[], organizations: RpOrganization[], org: string | null, entitlement: unknown, role: string | null }
}

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s)
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (s.rec.isImpersonation)
    throw createError({ statusCode: 400, statusMessage: 'Already impersonating' })

  const { userId } = await readValidatedBody(event, bodySchema.parse)
  const res = await idpFetch<ImpersonateResponse>(event, s.id, s.rec, '/api/auth/rp/impersonate', {
    method: 'POST',
    body: { userId },
  })

  const backupId = newSessionId()
  await writeSessionRecord(backupId, { ...s.rec, isImpersonation: false })

  s.rec = {
    sub: res.user.sub,
    user: { sub: res.user.sub, email: res.user.email, name: res.user.name ?? null, picture: res.user.picture ?? null },
    abilities: res.claims.abilities,
    systemRole: null,
    organizations: res.claims.organizations,
    activeOrg: res.claims.org,
    entitlement: res.claims.entitlement as never,
    accessToken: res.accessToken,
    refreshToken: null,
    idToken: null,
    accessExpiresAt: res.expiresAt,
    isImpersonation: true,
    impersonator: { sub: s.rec.user.sub, email: s.rec.user.email, name: s.rec.user.name, picture: s.rec.user.picture },
    backupId,
  }
  await writeSessionRecord(s.id, s.rec)
  return toPublicSession(s.rec)
})
