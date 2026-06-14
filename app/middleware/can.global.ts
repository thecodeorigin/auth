/**
 * Route ability gate. Pages opt in with `definePageMeta({ can: ['project:read'] })`
 * (subject:action; array = OR semantics). Fails to /403.
 */
export default defineNuxtRouteMiddleware((to) => {
  const required = (to.meta.can ?? []) as string[]
  if (!required.length)
    return

  const { $ability } = useNuxtApp()
  const ok = required.some((req) => {
    const [s = '', a = ''] = req.split(':')
    return $ability.can(a, s)
  })

  if (!ok)
    return navigateTo('/403')
})
