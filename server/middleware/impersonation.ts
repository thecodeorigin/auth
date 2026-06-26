export default defineEventHandler((event) => {
  const path = event.path || ''
  const guarded = path.startsWith('/api/auth/admin/impersonate-user')
    || path.startsWith('/api/auth/rp/impersonate')
  // /stop-impersonating must always be allowed so sessions can be cleaned up
  if (!guarded || path.startsWith('/api/auth/rp/stop-impersonating'))
    return

  const allowImpersonation = (useRuntimeConfig().allowImpersonation as string) === 'true'
  if (import.meta.dev || allowImpersonation)
    return

  throw createError({
    statusCode: 403,
    statusMessage: 'Impersonation is disabled in production. Break-glass: set NUXT_ALLOW_IMPERSONATION=true on the Worker.',
  })
})
