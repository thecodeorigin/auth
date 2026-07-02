import { defineEventHandler, getRequestHost, getRequestProtocol, sendRedirect } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { $fetch } from 'ofetch'
import { withQuery } from 'ufo'
import { destroySession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const { auth: runtimeConfig, public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  const rec = await destroySession(event)

  if (rec?.accessToken) {
    await $fetch(`https://${publicRuntimeConfig.domain}/api/auth/oauth2/revoke`, {
      method: 'POST',
      body: new URLSearchParams({
        token: rec.refreshToken ?? rec.accessToken,
        token_type_hint: rec.refreshToken ? 'refresh_token' : 'access_token',
        client_id: publicRuntimeConfig.clientId,
        client_secret: runtimeConfig.clientSecret,
      }).toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    }).catch(() => {})
  }

  // RP-Initiated Logout (https://openid.net/specs/openid-connect-rpinitiated-1_0.html):
  // without this browser redirect the IdP's own session cookie survives, so the next
  // sign-in silently re-authenticates instead of prompting — falls back to a local-only
  // sign-out when there's no id_token (e.g. session predates this field).
  const postLogoutRedirectUri = `${getRequestProtocol(event)}://${getRequestHost(event)}${publicRuntimeConfig.routes.home}`

  if (rec?.idToken) {
    return sendRedirect(event, withQuery(`https://${publicRuntimeConfig.domain}/api/auth/oauth2/end-session`, {
      id_token_hint: rec.idToken,
      client_id: publicRuntimeConfig.clientId,
      post_logout_redirect_uri: postLogoutRedirectUri,
    }))
  }

  return sendRedirect(event, publicRuntimeConfig.routes.home)
})
