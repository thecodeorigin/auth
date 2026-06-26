import { defineEventHandler, sendRedirect } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { $fetch } from 'ofetch'
import { destroySession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const { public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  const rec = await destroySession(event)
  if (rec?.accessToken) {
    try {
      await $fetch(`https://${publicRuntimeConfig.domain}/api/auth/oauth2/endsession`, {
        method: 'POST',
        body: new URLSearchParams({ token: rec.refreshToken ?? rec.accessToken }).toString(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    }
    catch {}
  }
  return sendRedirect(event, publicRuntimeConfig.routes.home)
})
