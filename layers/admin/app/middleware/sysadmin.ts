/**
 * Platform (system-admin) route gate. Reads the role directly off the session
 * (not $ability) so the check is robust against ability-hydration timing.
 * Admin pages opt in with `definePageMeta({ middleware: 'sysadmin' })`.
 */
export default defineNuxtRouteMiddleware(async () => {
  const { user, waitForSession } = useUserSession()

  try {
    await waitForSession()
  }
  catch {
    // fall through to the role check below
  }

  if (user.value?.role !== 'admin')
    return navigateTo('/403')
})
