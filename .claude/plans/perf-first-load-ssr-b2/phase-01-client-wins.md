# Phase 1 — Client-side wins (no new infra, no outage risk)

Pure client-side changes that remove wasted round-trips. Ships independently of
the SSR work. **No `server: false` removed here, no SSR self-fetch — so none of
the rate-limiter risk applies.**

## Step 1.1 — Parallelize the members page reads

`members.vue` fetches `listMembers()` then `listRoles()` **sequentially**
(`members.vue:37` then `:41`). They're independent reads — run them together.
Use `Promise.allSettled` (not `Promise.all`) so a member who can list members but
not roles still sees the table instead of an error page (failure-mode critic).

**File:** `layers/organization/app/pages/orgs/[slug]/members.vue`

Replace the body of `load()` (currently lines 33–51):

```ts
async function load() {
  loading.value = true
  error.value = ''
  const [membersRes, rolesRes] = await Promise.allSettled([
    orgApi.listMembers(),
    orgApi.listRoles(),
  ])

  if (membersRes.status === 'fulfilled') {
    const { data, error: e } = membersRes.value
    if (e)
      error.value = e.message ?? 'Failed to load members'
    else
      members.value = ((data as { members?: MemberRow[] })?.members ?? [])
  }
  else {
    error.value = 'Failed to load members'
  }

  // Roles are non-critical: degrade to the built-in set on failure.
  if (rolesRes.status === 'fulfilled') {
    const dyn = ((rolesRes.value.data as { roles?: { role: string }[] })?.roles ?? []).map(r => r.role)
    roleNames.value = Array.from(new Set(['owner', 'admin', 'member', ...dyn]))
  }

  loading.value = false
}
```

> Apply the same `allSettled` shape to any other first-load-critical page that
> does **two independent** reads in `onMounted`. Do **not** sweep all ~18
> `onMounted(load)` pages — most do a single fetch and there's nothing to
> parallelize (YAGNI critic).

## Step 1.2 — Remove the one verified-redundant mount `fetchSession`

`admin/users.vue` does `await fetchSession({ force: true })` on mount (line 64)
before checking the role and listing users. SSR already populated `user`, and the
custom/admin **server** endpoints are the real authority — this forced refresh is
a wasted round-trip on the critical path.

> ⚠️ **Audit, do not sweep.** The grep found ~13 `fetchSession({force})` calls.
> **Keep every post-mutation one** — they exist to pull a *changed* session and
> removing them is a security-visible bug:
> - Impersonation: `admin/users.vue:49,58`, `ImpersonateMenu.vue:51,68`,
>   `layouts/default.vue:28` (inside `stopImpersonating()` — **not** a mount call).
> - Accept-invite / create-org / set-active: `invitations/[id].vue:42`,
>   `invitations/index.vue:47`, `orgs/new.vue:53`, `orgs/[slug]/settings.vue:101`,
>   `orgs/[slug]/index.vue:27`, `platform/users/[id].vue:128`.
>
> The **only** call removed in this step is the *mount-refresh* at
> `admin/users.vue:64`. (`orgs/index.vue:53` is the same pattern but that page is
> raw-HTML scaffolding slated for separate cleanup — leave it.)

**File:** `app/pages/admin/users.vue` — change `onMounted` (lines 61–70):

```ts
onMounted(async () => {
  if (!import.meta.client)
    return
  // Session is seeded by the server session plugin; the admin list endpoint is
  // itself admin-gated, so no forced re-fetch is needed just to render the page.
  if (user.value?.role !== 'admin' && !impersonating.value) {
    await navigateTo('/')
    return
  }
  await load()
})
```

`fetchSession` is still destructured for the impersonation handlers (lines 49,
58) — leave those imports and calls intact.

## Verification

```bash
pnpm exec nuxi typecheck    # 0 errors
pnpm lint
```

- [ ] Members page: Network shows `listMembers` + `listRoles` firing in parallel.
- [ ] Members page still renders with the built-in role set if `listRoles` 403s.
- [ ] Admin users page lists users with one fewer round-trip; an authed admin is
      not redirected; impersonation start/stop still updates the banner.
