import { defineEventHandler, sendRedirect } from 'h3'
import { $fetch } from 'ofetch'
import { resolveAuthConfig } from '../utils/oidc'
import { destroySession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const cfg = resolveAuthConfig()
  const rec = await destroySession(event)
  if (rec?.accessToken) {
    try {
      await $fetch(`${cfg.issuer}/oauth2/endsession`, {
        method: 'POST',
        body: new URLSearchParams({ token: rec.refreshToken ?? rec.accessToken }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    }
    catch {}
  }
  return sendRedirect(event, cfg.routes.home)
})
