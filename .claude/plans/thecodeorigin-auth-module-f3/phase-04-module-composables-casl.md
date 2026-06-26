# Phase 4 — Composables (`useAuth`/`useCasl`), CASL plugin, middleware

**Repo:** `D:\projects\better-auth\packages\auth`
**Goal:** The client surface the user asked for — `useAuth()` / `useCasl()` auto-imported (and `#auth`), CASL `$ability` derived from session abilities, and the two global middlewares.

**Depends on:** Phase 3.

---

## Step 4.1 — Session plugin (seeds state)

`src/runtime/app/plugins/0.session.ts`:

```ts
import type { PublicSession } from '../../../contract'
import { defineNuxtPlugin, useRequestFetch, useState } from '#app'

export default defineNuxtPlugin(async () => {
  const session = useState<PublicSession | null>('tco-auth-session', () => null)
  // SSR-safe: forward cookies so the KV record is read for the current request.
  if (session.value === null) {
    try { session.value = await useRequestFetch()('/api/_auth/session') as PublicSession | null }
    catch { session.value = null }
  }
})
```

> `0.` prefix ensures it runs before the ability plugin. `useRequestFetch` forwards the incoming cookie during SSR so `/api/_auth/session` resolves the right record.

## Step 4.2 — `useAuth`

`src/runtime/app/composables/useAuth.ts`:

```ts
import type { ImpersonationCandidate, PublicSession, RpOrganization } from '../../../contract'
import { computed } from 'vue'
import { navigateTo, useRuntimeConfig, useState } from '#app'

export function useAuth() {
  const session = useState<PublicSession | null>('tco-auth-session', () => null)
  const routes = (useRuntimeConfig().public as any).auth.routes

  const user = computed(() => session.value?.user ?? null)
  const loggedIn = computed(() => !!session.value)
  const abilities = computed<string[]>(() => session.value?.abilities ?? [])
  const impersonator = computed(() => session.value?.impersonator ?? null)
  const isImpersonating = computed(() => !!session.value?.impersonator)

  async function refresh() { session.value = await $fetch<PublicSession | null>('/api/_auth/session') }

  function getOrganizations(): RpOrganization[] {
    // Per-client scoped list (orgs THIS app may act in), from userinfo at login. See README.
    return session.value?.organizations ?? []
  }
  async function switchOrganization(orgId: string) {
    session.value = await $fetch<PublicSession>('/api/_auth/organizations/switch', { method: 'POST', body: { organizationId: orgId } })
  }
  function getImpersonatableUsers(query?: { q?: string, limit?: number, offset?: number }) {
    return $fetch<{ items: ImpersonationCandidate[], hasMore: boolean }>('/api/_auth/impersonatable-users', { query })
  }
  async function impersonate(userId: string) {
    session.value = await $fetch<PublicSession>('/api/_auth/impersonate', { method: 'POST', body: { userId } })
  }
  async function stopImpersonating() {
    session.value = await $fetch<PublicSession>('/api/_auth/stop-impersonating', { method: 'POST' })
  }
  function signIn(redirect?: string) {
    return navigateTo(redirect ? `${routes.signIn}?redirect=${encodeURIComponent(redirect)}` : routes.signIn, { external: true })
  }
  function signOut() { return navigateTo(routes.signOut, { external: true }) }

  return { session, user, loggedIn, abilities, impersonator, isImpersonating,
    getOrganizations, switchOrganization, getImpersonatableUsers, impersonate, stopImpersonating,
    signIn, signOut, refresh }
}
```

`#auth` alias resolves here (Phase 3 §3.2), so `import { useAuth } from '#auth'` works alongside the auto-import.

## Step 4.3 — CASL ability plugin + `useCasl`

`src/runtime/app/plugins/ability.ts` (mirrors the IdP's `app/plugins/ability.ts`, but rules come from the flat `abilities` claim):

```ts
import type { MongoAbility, RawRuleOf } from '@casl/ability'
import type { PublicSession } from '../../../contract'
import { createMongoAbility } from '@casl/ability'
import { abilitiesPlugin } from '@casl/vue'
import { defineNuxtPlugin, useState } from '#app'
import { watch } from 'vue'

export default defineNuxtPlugin((nuxtApp) => {
  const session = useState<PublicSession | null>('tco-auth-session', () => null)
  const ability = createMongoAbility<MongoAbility>([])
  nuxtApp.vueApp.use(abilitiesPlugin, ability, { useGlobalProperties: true })

  function rules(): RawRuleOf<MongoAbility>[] {
    const s = session.value
    if (!s) return []
    if (s.systemRole === 'admin') return [{ action: 'manage', subject: 'all' }]
    return (s.abilities ?? []).map((a) => { const [subject, action] = a.split(':'); return { action, subject } })
  }
  watch(session, () => ability.update(rules()), { immediate: true, deep: true })
  return { provide: { ability } }
})
```

`src/runtime/app/composables/useCasl.ts`:

```ts
import { useNuxtApp } from '#app'

export function useCasl() {
  const { $ability } = useNuxtApp() as any
  return {
    ability: $ability,
    can: (action: string, subject: string, field?: string) => $ability.can(action, subject, field),
    cannot: (action: string, subject: string, field?: string) => $ability.cannot(action, subject, field),
  }
}
```

> Add `@casl/ability` (pin **v6** — memory: needed for `@casl/vue` v2 peer) and `@casl/vue` v2 to `packages/auth/package.json` deps.

## Step 4.4 — Middleware

`src/runtime/app/middleware/auth.global.ts`:

```ts
import { defineNuxtRouteMiddleware, navigateTo, useRuntimeConfig, useState } from '#app'

export default defineNuxtRouteMiddleware((to) => {
  const session = useState('tco-auth-session', () => null)
  const routes = (useRuntimeConfig().public as any).auth.routes
  const authed = !!session.value
  const isPublic = to.meta.public === true || to.meta.unauthenticatedOnly === true
  if (authed && to.meta.unauthenticatedOnly) return navigateTo(routes.home)
  if (!authed && !isPublic) return navigateTo(`${routes.signIn}?redirect=${encodeURIComponent(to.fullPath)}`, { external: true })
})
```

> The session is already seeded by `0.session` plugin (runs before middleware). Do NOT fetch the IdP here (FM M2).

`src/runtime/app/middleware/casl.global.ts`:

```ts
import { defineNuxtRouteMiddleware, navigateTo, useNuxtApp } from '#app'

export default defineNuxtRouteMiddleware((to) => {
  const required = (to.meta.can ?? []) as string[]
  if (!required.length) return
  const { $ability } = useNuxtApp() as any
  const ok = required.every((r) => { const [subject, action] = r.split(':'); return $ability.can(action, subject) })
  if (!ok) return navigateTo('/403')
})
```

> `/403` is the consumer's page (nuxt-template has `forbidden.vue`; the IdP has `/403`). Make the forbidden path a module option if needed; default `/403`.

---

## Verification
- `pnpm --filter @thecodeorigin/auth test:types` → 0.
- In the playground (Phase 6): `useAuth().user` populated after login; `useCasl().can('read','project')` matches the seeded role's abilities; a page with `definePageMeta({ can: ['project:delete'] })` redirects a member to `/403`.

## Acceptance
- [ ] `useAuth()` / `useCasl()` auto-imported and importable from `#auth`.
- [ ] `$ability` reactively tracks the session; system admin → `manage all`.
- [ ] auth + casl middleware gate as specified, with no IdP hot-path calls.
