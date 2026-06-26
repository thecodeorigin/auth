import { createError, defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { withQuery } from 'ufo'
import { callbackRedirectUri, pkceChallenge, randomString, safePath } from '../utils/oidc'

export default defineEventHandler(async (event) => {
  const { auth: runtimeConfig, public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  if (!publicRuntimeConfig.domain || !publicRuntimeConfig.clientId || !runtimeConfig.clientSecret)
    throw createError({ statusCode: 503, statusMessage: 'Auth not configured' })

  const state = randomString(32)
  const verifier = randomString(64)
  const redirectTo = safePath(getQuery(event).redirect as string | undefined, publicRuntimeConfig.routes.home)
  const opts = { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax' as const, maxAge: 600, path: publicRuntimeConfig.routes.callback }
  setCookie(event, 'tco_state', state, opts)
  setCookie(event, 'tco_verifier', verifier, opts)
  setCookie(event, 'tco_redirect', redirectTo, opts)

  return sendRedirect(event, withQuery(`https://${publicRuntimeConfig.domain}/api/auth/oauth2/authorize`, {
    client_id: publicRuntimeConfig.clientId,
    redirect_uri: callbackRedirectUri(event),
    response_type: 'code',
    scope: publicRuntimeConfig.scopes.join(' '),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: 'S256',
  }))
})
