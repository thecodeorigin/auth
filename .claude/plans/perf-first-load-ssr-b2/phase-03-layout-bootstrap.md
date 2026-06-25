# Phase 3 — Layout `serverAuth` bootstrap (SSR the waterfall head once)

**Depends on Phase 2** — the bootstrap is itself an SSR `$http` self-fetch, so the
ofetch IP-forwarding fix + rate-limiter verification (Phase 2.1/2.2) must be in
first.

## The idea

The waterfall *head* — session → active-org slug → member role — is a
**layout-level** concern that runs on every dashboard page. Today the slug
(`getFull`, `server:false`) and role (`getActiveMemberRole`, client-only) resolve
**after** hydration, so the sidebar nav and (for members) `$ability` are wrong/empty
at first paint and snap in afterward. Resolve them **once on the server** via the
already-proven `serverAuth(event)` path and seed the shared state, so first paint
is correct — no flicker, no transient 403, no client round-trip for the head.

We do **not** SSR the per-page data tails (members list, etc.) — that stays
client-side for now (deferred per YAGNI). Phase 3 fixes the shared shell + unblocks
the home content (already SSR via Phase 2).

## Step 3.1 — New bootstrap route

**File (new):** `server/api/bootstrap.get.ts`

```ts
export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user)
    return { activeOrg: null, memberRole: null }

  // serverAuth(event) is the per-request better-auth instance (same one the
  // OAuth admin routes use). With no query, getFullOrganization / getActiveMemberRole
  // resolve against the session's ACTIVE org — exactly what the nav + ability need.
  // SEC-NAMES: verify these method names exist on `auth.api` (they mirror the
  // organization client plugin) before relying on them.
  const auth = serverAuth(event)
  const [orgRes, roleRes] = await Promise.allSettled([
    auth.api.getFullOrganization({ headers: event.headers }),
    auth.api.getActiveMemberRole({ headers: event.headers }),
  ])

  const org = orgRes.status === 'fulfilled'
    ? (orgRes.value as { id: string, slug?: string | null, name: string } | null)
    : null
  const memberRole = roleRes.status === 'fulfilled'
    ? ((roleRes.value as { role?: string } | null)?.role ?? null)
    : null

  return {
    activeOrg: org ? { id: org.id, slug: org.slug ?? null, name: org.name } : null,
    memberRole,
  }
})
```

> `getUserSession` / `serverAuth` are auto-imported from `@onmax/nuxt-better-auth`.
> The route lives under `/api/**` (CSRF-exempt via existing `routeRules`).
> `allSettled` keeps a member with no active org (both calls may error) returning
> a clean `{ activeOrg: null, memberRole: null }` instead of a 500.

## Step 3.2 — New `useBootstrap` composable

**File (new):** `app/composables/useBootstrap.ts`

```ts
export interface BootstrapData {
  activeOrg: { id: string, slug: string | null, name: string } | null
  memberRole: string | null
}

/**
 * SSR-resolves the dashboard "head" (active-org slug + member role) once and
 * seeds the shared state consumed by the sidebar nav (`activeOrgSlug`) and the
 * CASL ability plugin (`ability.orgRole`). Runs on the server so first paint is
 * correct; the result rehydrates from the payload on the client (no extra call).
 * Deduped by the `bootstrap` key, so calling it from multiple places is free.
 */
export function useBootstrap() {
  const { loggedIn } = useUserSession()
  const activeOrgSlug = useState<string | null>('activeOrgSlug', () => null)
  const activeMemberRole = useState<string | null>('ability.orgRole', () => null)

  const { data, refresh } = useAsyncData<BootstrapData>('bootstrap', () => {
    if (!loggedIn.value)
      return Promise.resolve({ activeOrg: null, memberRole: null })
    return $http<BootstrapData>('/api/bootstrap', { silent: true })
  })

  watchEffect(() => {
    if (!data.value)
      return
    activeOrgSlug.value = data.value.activeOrg?.slug ?? null
    activeMemberRole.value = data.value.memberRole ?? null
  })

  return { bootstrap: data, refresh, activeOrgSlug, activeMemberRole }
}
```

Reuses the **exact** state keys the layout and ability plugin already read
(`activeOrgSlug`, `ability.orgRole`) — no other consumer changes.

## Step 3.3 — `useActiveOrg` consumes the bootstrap

Refactor so the slug + role come from the SSR bootstrap; keep only the
no-active-org auto-select dance (client-only) and the full-org-detail fetch (still
client `server:false`, used by org-scoped pages). Critically, the full-org watcher
must **not clobber** the bootstrap-seeded slug with `null`.

**File:** `app/composables/useActiveOrg.ts` — replace the whole file:

```ts
/**
 * Resolves the active organization for the dashboard. The active-org slug and
 * the member role are SSR-resolved via `useBootstrap()` (collapsing the old
 * client-side waterfall head). This composable adds: (1) the first-load
 * auto-select of a member's first org when none is active, and (2) the full org
 * detail used by org-scoped pages.
 */
export function useActiveOrg() {
  const { session, fetchSession } = useUserSession()
  const orgApi = useOrgApi()
  const autoSelecting = useState<boolean>('activeOrg.autoSelecting', () => false)

  const activeOrgId = computed(() => session.value?.activeOrganizationId ?? null)

  // SSR-seeded slug + role (shared state). refreshBootstrap re-resolves after an
  // org switch below.
  const { activeOrgSlug, activeMemberRole, refresh: refreshBootstrap } = useBootstrap()

  // Members land without an active org; auto-select their first one once (client
  // only, first-ever load — the common returning case already has activeOrgId).
  watch(activeOrgId, async () => {
    if (!import.meta.client || activeOrgId.value || autoSelecting.value)
      return
    autoSelecting.value = true
    try {
      const { data } = await orgApi.list()
      const first = (data ?? [])[0]
      if (first) {
        await orgApi.setActive(first.id)
        await fetchSession({ force: true })
        await refreshBootstrap() // pull slug + role for the newly active org
      }
    }
    catch {
      // no orgs / not ready — nav simply omits org items
    }
    finally {
      autoSelecting.value = false
    }
  }, { immediate: true })

  // Full org detail for org-scoped pages. Client-only for now; refines (never
  // nulls) the bootstrap-seeded slug when it loads.
  const { data: org, refresh, pending } = useAsyncData(
    'active-org',
    async () => {
      if (!activeOrgId.value)
        return null
      const { data } = await orgApi.getFull()
      return data ?? null
    },
    { watch: [activeOrgId], server: false },
  )

  watch(org, (o) => {
    const slug = (o as { slug?: string } | null)?.slug
    if (slug)
      activeOrgSlug.value = slug
  })

  return { org, activeOrgId, activeOrgSlug, activeMemberRole, refresh, pending }
}
```

What was removed: the standalone client-only `getActiveMemberRole` watcher (role
now comes from the SSR bootstrap), and the slug-nulling write (was
`activeOrgSlug.value = o?.slug ?? null`).

## Step 3.4 — Layout calls the bootstrap on SSR

`layouts/default.vue` already calls `useActiveOrg()` (line 13), which now pulls in
`useBootstrap()` — so the head resolves on SSR with no layout edit required. Verify
the destructure still gets `activeOrgSlug` (it does). **No change needed** beyond
confirming it.

### Optional 3.4b — SSR the sidebar nav

The nav is wrapped in `<ClientOnly>` (`default.vue:148-165`), almost certainly
because slug + role were client-only and would hydration-mismatch. Now that both
are SSR-deterministic, you *may* remove that `<ClientOnly>` wrapper so the nav
paints server-side. **Only do this if** the live walk shows zero hydration warnings
and identical server/client nav. If any warning appears, keep `<ClientOnly>` — the
ability/slug correctness (no flicker of *visibility*) is the main win; SSR-painting
the nav markup is a bonus. Leave the impersonation-banner and overlay `<ClientOnly>`
blocks alone (they're genuinely client-state).

## Verification

```bash
pnpm build && pnpm preview
pnpm exec nuxi typecheck    # 0 errors
pnpm lint
node examples/sso-proof.mjs && node examples/authz-proof.mjs \
  && node examples/entitlement-proof.mjs && node examples/billing-proof.mjs
```

Live walk (Chrome DevTools MCP, cold loads):

- [ ] Member cold-loads an org page: sidebar org-scoped items + org switcher are
      in their **final** state at first paint; **no** post-hydration toggle/flicker
      of ability-gated nav items, **no** transient 403.
- [ ] `window.__NUXT__` contains a `bootstrap` payload with `activeOrg`/`memberRole`;
      Network shows **no** client `getActiveMemberRole` / initial `getFullOrganization`
      call before the shell is correct.
- [ ] Switching orgs still updates the slug + role (the dance refreshes bootstrap).
- [ ] Admin (system `role==='admin'`) still gets `manage all` ability (unaffected —
      ability admin branch doesn't depend on `memberRole`).
- [ ] All four proof scripts pass; impersonation banner correct.
