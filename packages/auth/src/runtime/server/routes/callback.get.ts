import { defineEventHandler, deleteCookie, getCookie, getQuery, sendRedirect } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { z } from 'zod'
import { UserinfoClaimsSchema } from '../../../contract'
import { callbackRedirectUri, exchangeCode, fetchUserinfo, safePath } from '../utils/oidc'
import { newSessionId, setSessionCookie, writeSessionRecord } from '../utils/session'

const RawUserinfoSchema = UserinfoClaimsSchema.extend({
  sub: z.string(),
  email: z.string().optional(),
  email_verified: z.union([z.boolean(), z.string()]).optional(),
  name: z.string().optional(),
  picture: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const { public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  const q = getQuery(event)
  const fail = (e: string) => sendRedirect(event, `${publicRuntimeConfig.routes.error}?error=${encodeURIComponent(e)}`)

  if (q.error)
    return fail(String(q.error))

  const state = getCookie(event, 'tco_state')
  const verifier = getCookie(event, 'tco_verifier')
  const redirectTo = safePath(getCookie(event, 'tco_redirect'), publicRuntimeConfig.routes.home)
  for (const c of ['tco_state', 'tco_verifier', 'tco_redirect'])
    deleteCookie(event, c, { path: publicRuntimeConfig.routes.callback })

  if (!q.code || !q.state || !state || q.state !== state || !verifier)
    return fail('invalid_state')

  let tokens: { access_token: string, refresh_token?: string, expires_in?: number }
  let userinfoRaw: unknown
  try {
    tokens = await exchangeCode(String(q.code), verifier, callbackRedirectUri(event))
    userinfoRaw = await fetchUserinfo(tokens.access_token)
  }
  catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err)
    console.error('[auth:callback] exchange failed:', detail)
    return fail('token_exchange_failed')
  }

  const parsed = RawUserinfoSchema.safeParse(userinfoRaw)
  if (!parsed.success)
    return fail('userinfo_invalid')

  const u = parsed.data
  const verified = u.email_verified === true || u.email_verified === 'true'
  if (!u.sub || !u.email || !verified)
    return fail('email_unverified')

  const id = newSessionId()
  await writeSessionRecord(id, {
    sub: u.sub,
    user: { sub: u.sub, email: u.email, name: u.name ?? null, picture: u.picture ?? null },
    abilities: u.abilities,
    systemRole: u.role,
    organizations: u.organizations,
    activeOrg: u.org,
    entitlement: u.entitlement,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    accessExpiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    isImpersonation: false,
    impersonator: null,
    backupId: null,
  })
  await setSessionCookie(event, id)
  return sendRedirect(event, redirectTo)
})
