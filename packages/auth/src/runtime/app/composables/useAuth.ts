import type { AbilityRule, ImpersonationCandidate, PublicSession, RpOrganization } from '../../../contract'
import { computed } from 'vue'
import { navigateTo, useRuntimeConfig, useState } from '#app'

export function useAuth() {
  const session = useState<PublicSession | null>('tco-auth-session', () => null)
  const routes = ((useRuntimeConfig().public as Record<string, unknown> & { auth?: { routes?: Record<string, string> } }).auth?.routes) ?? {} as Record<string, string>

  const user = computed(() => session.value?.user ?? null)
  const loggedIn = computed(() => !!session.value)
  const abilities = computed<AbilityRule[]>(() => session.value?.abilities ?? [])
  const impersonator = computed(() => session.value?.impersonator ?? null)
  const isImpersonating = computed(() => !!session.value?.impersonator)

  async function refresh() {
    session.value = await $fetch<PublicSession | null>('/api/_auth/session')
  }

  function getOrganizations(): RpOrganization[] {
    return session.value?.organizations ?? []
  }

  async function switchOrganization(orgId: string) {
    session.value = await $fetch<PublicSession>('/api/_auth/organizations/switch', {
      method: 'POST',
      body: { organizationId: orgId },
    })
  }

  function getImpersonatableUsers(query?: { q?: string, limit?: number, offset?: number }) {
    return $fetch<{ items: ImpersonationCandidate[], hasMore: boolean }>('/api/_auth/impersonatable-users', { query })
  }

  async function impersonate(userId: string) {
    session.value = await $fetch<PublicSession>('/api/_auth/impersonate', {
      method: 'POST',
      body: { userId },
    })
  }

  async function stopImpersonating() {
    session.value = await $fetch<PublicSession>('/api/_auth/stop-impersonating', { method: 'POST' })
  }

  function signIn(redirect?: string) {
    return navigateTo(
      redirect ? `${routes.signIn}?redirect=${encodeURIComponent(redirect)}` : routes.signIn,
      { external: true },
    )
  }

  function signOut() {
    return navigateTo(routes.signOut, { external: true })
  }

  return {
    session,
    user,
    loggedIn,
    abilities,
    impersonator,
    isImpersonating,
    getOrganizations,
    switchOrganization,
    getImpersonatableUsers,
    impersonate,
    stopImpersonating,
    signIn,
    signOut,
    refresh,
  }
}
