export default defineEventHandler((event) => {
  const path = event.path || ''
  if (!path.startsWith('/api/auth/admin/impersonate-user'))
    return

  const allowImpersonation = (useRuntimeConfig().allowImpersonation as string) === 'true'
  if (import.meta.dev || allowImpersonation)
    return

  throw createError({
    statusCode: 403,
    statusMessage: 'Impersonation is disabled in production. Break-glass: set NUXT_ALLOW_IMPERSONATION=true on the Worker.',
  })
})
