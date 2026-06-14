// Reports which social providers are configured (non-secret). Used by the
// Connected Accounts screen (only offer working providers) and the admin
// Providers screen (current status). Any authenticated user may read it.
export default defineEventHandler(async (event) => {
  await requireUserSession(event)
  const rc = useRuntimeConfig(event)
  return {
    providers: [
      { id: 'google', label: 'Google', configured: Boolean(rc.googleClientId && rc.googleClientSecret) },
      { id: 'github', label: 'GitHub', configured: Boolean(rc.githubClientId && rc.githubClientSecret) },
    ],
  }
})
