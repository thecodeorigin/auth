import type { PublicSession } from '../../../contract'
import { defineNuxtPlugin, useRequestFetch, useState } from '#app'

export default defineNuxtPlugin(async () => {
  const session = useState<PublicSession | null>('tco-auth-session', () => null)
  if (session.value === null) {
    try {
      session.value = await useRequestFetch()('/api/_auth/session') as PublicSession | null
    }
    catch {
      session.value = null
    }
  }
})
