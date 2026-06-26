import { defineNuxtRouteMiddleware, navigateTo, useNuxtApp } from '#app'

export default defineNuxtRouteMiddleware((to) => {
  const required = (to.meta.can ?? []) as string[]
  if (!required.length)
    return
  const { $ability } = useNuxtApp() as { $ability: { can: (action: string, subject: string) => boolean } }
  const ok = required.every((r) => {
    const idx = r.indexOf(':')
    if (idx === -1)
      return false
    const subject = r.slice(0, idx)
    const action = r.slice(idx + 1)
    return $ability.can(action, subject)
  })
  if (!ok)
    return navigateTo('/403')
})
