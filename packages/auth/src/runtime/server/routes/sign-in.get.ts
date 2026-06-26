import { createError, defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3'
import { withQuery } from 'ufo'
import { callbackRedirectUri, pkceChallenge, randomString, resolveAuthConfig, safePath } from '../utils/oidc'

export default defineEventHandler(async (event) => {
  const cfg = resolveAuthConfig()
  if (!cfg.issuer || !cfg.clientId || !cfg.clientSecret)
    throw createError({ statusCode: 503, statusMessage: 'Auth not configured' })

  const state = randomString(32)
  const verifier = randomString(64)
  const redirectTo = safePath(getQuery(event).redirect as string | undefined, cfg.routes.home)
  const opts = { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax' as const, maxAge: 600, path: cfg.routes.callback }
  setCookie(event, 'tco_state', state, opts)
  setCookie(event, 'tco_verifier', verifier, opts)
  setCookie(event, 'tco_redirect', redirectTo, opts)

  return sendRedirect(event, withQuery(`${cfg.issuer}/oauth2/authorize`, {
    client_id: cfg.clientId,
    redirect_uri: callbackRedirectUri(event, cfg),
    response_type: 'code',
    scope: cfg.scopes.join(' '),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  }))
})
