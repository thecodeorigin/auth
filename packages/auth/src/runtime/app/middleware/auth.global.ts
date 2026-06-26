import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig, useState } from '#app'

export default defineNuxtRouteMiddleware((to) => {
  const session = useState('tco-auth-session', () => null)
  const routes = ((useRuntimeConfig().public as Record<string, unknown> & { auth?: { routes?: Record<string, string> } }).auth?.routes) ?? {} as Record<string, string>
  const authed = !!session.value
  const isPublic = to.meta.public === true || to.meta.unauthenticatedOnly === true
  if (authed && to.meta.unauthenticatedOnly)
    return navigateTo(routes.home)
  if (!authed && !isPublic)
    return navigateTo(`${routes.signIn}?redirect=${encodeURIComponent(to.fullPath)}`, { external: true })
})
