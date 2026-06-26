# Phase 7 — nuxt-template refactor: delete auth layer, consume the module

**Repo:** `D:\projects\nuxt-template` (cook runs HERE for this phase)
**Goal:** Remove nuxt-template's entire local auth/org subsystem and wire it to `@thecodeorigin/auth`. Business tables keep their `user_id`/`organization_id` columns but lose the FK to the now-deleted `userTable`/`organizationTable`.

**Depends on:** Phase 6 (built/linked module).

> **Open Q2 (identity re-keying)** and **Open Q3 (distribution)** must be answered before this phase. The steps below assume: reseed dev data under IdP `sub` ids (no prod backfill), and `file:` link the module.

---

## Step 7.1 — Install + register the module

`package.json`:
```jsonc
"dependencies": { "@thecodeorigin/auth": "file:../better-auth/packages/auth" }
```
```bash
cd D:/projects/nuxt-template && pnpm install
```

`nuxt.config.ts` — add to `modules` and add the `auth` block; remove the OIDC runtimeConfig keys now owned by the module:

```ts
modules: [ /* ...existing... */ '@thecodeorigin/auth' ],
auth: {
  domain: 'auth.thecodeorigin.com',        // NUXT_THECODEORIGIN_DOMAIN (dev: localhost:3000 + issuer override)
  clientId: '', clientSecret: '',          // NUXT_THECODEORIGIN_CLIENT_ID / _SECRET
  routes: { signIn: '/auth/sign-in', callback: '/auth/callback', signOut: '/auth/sign-out', home: '/dashboard', error: '/auth/login' },
},
```

Remove from `runtimeConfig`: `thecodeoriginIssuer`, `thecodeoriginClientId`, `thecodeoriginClientSecret` (now via the `auth` block / `NUXT_AUTH_CLIENT_SECRET` + `NUXT_THECODEORIGIN_*`). Keep `authSecret` only if still used for CSRF elsewhere (it is — `app/lib/ofetch.ts` `useCsrf()`).

**KV binding (Open Q4):** ensure NuxtHub KV is available for the module's session storage (base `auth`). nuxt-template already uses KV — confirm `useStorage('auth')` resolves to KV in prod (configure `nitro.storage` or rely on NuxtHub binding). Register the prod redirect URI `https://template.thecodeorigin.com/auth/callback` (and dev `http://localhost:3002/auth/callback`) on the IdP client.

## Step 7.2 — Delete the local auth subsystem

Delete these (full inventory from the explore):

**Server:**
- `layers/auth/server/api/auth/**` (login, logout, me, oidc, oidc/callback, providers, phone, impersonate/**, demo/**, roles/sync)
- `layers/auth/server/api/organization/**`, `organizations/**`, `roles/**`, `permissions/**`, `session/**`, `invitations/**`, `user/**`, `account/**`
- `layers/auth/server/services/**` (auth, admin, casl, email?, grants, impersonate, organization, permissions-registry, role, session, user) — keep `email.ts` only if other layers import it; otherwise delete.
- `layers/auth/server/constants/**`, `layers/auth/server/plugins/0.permissions.ts`
- `layers/auth/server/tasks/**` (auth seeds/creates/updates)
- The auth tables in `layers/auth/server/db/schema.ts`: `userTable`, `identityTable`, `activityTable`, `organizationTable`, `organizationMemberTable`, `roleTable`, `organizationMemberRoleTable`, `organizationInvitationTable`, `permissionTable`. (If the file holds ONLY auth tables, delete it; if it re-exports anything still used, prune.)

**Client:**
- `layers/auth/app/stores/auth.ts`
- `layers/auth/app/api/useAuthApi.ts`, `useOrganizationApi.ts`
- `layers/auth/app/composables/casl.ts`, `useOrganizationMembers.ts`
- `layers/auth/app/plugins/casl.ts`
- `layers/auth/app/middleware/auth.global.ts`, `casl.global.ts`
- `shared/permissions.ts` (now the module/IdP owns the catalog)
- `layers/auth/shared/schemas/**` auth/org/member/role/invitation schemas (keep any reused by retained pages)
- `layers/auth/app/pages/sandbox/impersonate.vue` (dev-only)

**Keep** (rewire in 7.3): `layers/auth/app/pages/auth/login.vue`, `forbidden.vue`, `app/layouts/auth.vue`, `app/layouts/default.vue`, and the components `AuthLoginCard.vue`, `UserMenu.vue`, `Impersonate*`, `Organization*`. Keep `app/types/router.d.ts` ONLY if it differs from the module's augmentation — the module already augments `public`/`unauthenticatedOnly`/`can`, so **delete the duplicate** to avoid conflicts.

## Step 7.3 — Rewire retained components/pages to `useAuth()`/`useCasl()`

Replace the old call sites (from the explore) — mapping table:

| Old | New |
|---|---|
| `useAuthStore().currentUser` | `useAuth().user` / `useAuth().session` |
| `useAuthStore().isImpersonating` | `useAuth().isImpersonating` |
| `useAuthStore().impersonator` | `useAuth().impersonator` |
| `useAuthStore().activeOrganizationId` | `useAuth().session.value?.activeOrg` |
| `useAuthStore().logout()` | `useAuth().signOut()` |
| `useAuthStore().startImpersonation(id)` | `useAuth().impersonate(id)` |
| `useAuthStore().stopImpersonation()` | `useAuth().stopImpersonating()` |
| `useAuthStore().switchOrganization(id)` | `useAuth().switchOrganization(id)` |
| `useAuthApi().fetchImpersonationCandidates(q)` | `useAuth().getImpersonatableUsers(q)` |
| `useOrganizationApi().fetchOrganizations()` | `useAuth().getOrganizations()` (sync, per-client list) |
| `$ability` via `useNuxtApp()` | `useCasl().ability` / `useCasl().can()` |

Specific files:
- `AuthLoginCard.vue`: the THECODEORIGIN button → `@click="useAuth().signIn('/dashboard')"` (or `<a :href="signInRoute">`). Remove credential/demo login UI unless still wanted for dev (the module is OIDC-only; if dev credential login is needed, it stays a nuxt-template-local concern hitting the IdP's email/password — out of scope, prefer removing).
- `login.vue`: keep `definePageMeta({ unauthenticatedOnly: true, layout: 'auth' })`; the module's auth middleware will bounce authed users to `routes.home`.
- `UserMenu.vue`, `Impersonate*`, `OrganizationMenu.vue`, `default.vue` banner: swap to `useAuth()` per the table. The impersonation banner reads `isImpersonating`/`impersonator` exactly as before.
- `app/lib/ofetch.ts` (`$http`): on 401, replace `useAuthApi().logout()` + redirect with `useAuth().signOut()` (or `navigateTo(signIn route)`).
- Pages that did org member/role/invitation management (`organization/members.vue`, `roles.vue`, `settings/*`, `join/[token].vue`): these called local org routes that are now **deleted**. Decision per Open scope: org/member/role MANAGEMENT (mutations) is NOT in the module's surface (the module exposes read `getOrganizations` + `switchOrganization` + impersonation only). Options for cook:
  - **(a)** Delete these management pages from nuxt-template (org admin happens in the IdP console). **Recommended** — matches "IdP is source of truth".
  - **(b)** Keep them but have them call the IdP's org endpoints directly via the access token (would need new IdP RP endpoints — out of current scope).
  Default to **(a)**; remove the management pages + their nav contributions. Confirm with the user if these screens are required in nuxt-template.

## Step 7.4 — Drop FK references, keep columns

Edit each domain schema: remove `.references(() => userTable.id, ...)` / `organizationTable.id` but keep the column as plain `text(...)`. Exact sites (from the explore):

- `layers/billing/server/db/schema.ts`: `transactionTable.user_id` (L61), `organization_id` refs (L6, L19, L52, L60).
- `layers/project/server/db/schema.ts`: `projectTable.created_by` (L11), `organization_id` (L7), `projectMemberTable.user_id` (L32).
- `layers/notification/server/db/schema.ts`: `user_id` (L8), `organization_id` (L7).
- `layers/referral/server/db/schema.ts`: `user_id` (L6), `referrer_id`/`referee_id` (L14/L15).
- `layers/selfhost/server/db/schema.ts`: `organization_id` (L6), `actor_user_id`/`organization_id` (L24/L25), `organization_id` (L40).
- `layers/support/server/db/schema.ts`: `user_id` (L17), `organization_id` (L18), `assigned_to` (L23), `author_id` (L40).

Pattern: `user_id: text('user_id').references(() => userTable.id, { onDelete: 'cascade' })` → `user_id: text('user_id')`. Remove the now-unused `userTable`/`organizationTable` imports.

Then regenerate + apply:
```bash
pnpm exec nuxi db generate   # drops the auth tables + FK constraints
# wipe local dev data so reseed uses IdP sub ids (Open Q2):
rm -rf .data .wrangler        # dev only
pnpm dev                      # migrations apply on boot
```

> **Open Q2:** business rows now store the IdP `sub` as `user_id`. Update any domain SEED tasks to use real IdP user ids (or a deterministic dev sub). For prod data, a separate backfill task mapping old local ids → `sub` is required — NOT in this phase; flag it.

## Step 7.5 — Business queries key on session sub

Anywhere a domain route previously used the local session user id to scope rows, it now uses `useAuth()`-equivalent on the server. The module's session is read server-side via the module's session util, but domain routes need the current user id. Add a tiny server helper in nuxt-template that reads it:

```ts
// server/utils/current-user.ts
import { readSessionRecord } from '#auth/server' // if the module exports a server util; else call /api/_auth/session internally
```

> **Cook check:** the module currently exposes session reading only via `/api/_auth/session` and internal utils. Domain server routes need `event`-level access to `{ sub, activeOrg }`. Add to the module a server util export (e.g. `getServerAuthSession(event)` returning `{ sub, activeOrg, abilities, systemRole }`) via `addServerImports`/package export, and use it in nuxt-template's `defineAuthenticatedHandler` replacement. This is a small addition to Phase 3's `session.ts` — surface it here so cook adds it: export `getServerAuthSession(event)` and re-export from the module's server entry. Replace nuxt-template's old `defineAuthenticatedHandler`/`defineAuthorizedHandler` with thin wrappers around it + `useCasl`-equivalent server ability checks derived from `session.abilities`.

## Step 7.6 — env

`.env.example` (nuxt-template): replace
```
NUXT_THECODEORIGIN_ISSUER=
NUXT_THECODEORIGIN_CLIENT_ID=
NUXT_THECODEORIGIN_CLIENT_SECRET=
```
with
```
NUXT_THECODEORIGIN_DOMAIN=auth.thecodeorigin.com
NUXT_THECODEORIGIN_CLIENT_ID=
NUXT_THECODEORIGIN_CLIENT_SECRET=
# dev: NUXT_THECODEORIGIN_ISSUER=http://localhost:3000/api/auth  (issuer override)
```

---

## Verification
```bash
cd D:/projects/nuxt-template
pnpm exec nuxi typecheck     # 0 — proves all useAuthStore/useAuthApi call sites are gone
pnpm lint
pnpm dev                     # :3002
```
Browser walk (Chrome DevTools MCP), IdP on :3000 with the nuxt-template client seeded:
1. Visit `/dashboard` unauthenticated → bounced to IdP login.
2. Sign in → back on `/dashboard`, `useAuth().user` populated.
3. Org switcher lists granted orgs; switching changes `useCasl().can(...)`.
4. Sign in as admin → impersonate a member (banner appears, destructive actions locked) → stop.
5. Sign out → cleared; no tokens in cookies/storage.
6. grep the repo: zero references to `useAuthStore`, `useAuthApi`, `useOrganizationApi`, deleted services.

## Acceptance
- [ ] nuxt-template has no local auth/org tables and no `.references(() => userTable.id)`; business columns retained.
- [ ] All retained pages/components compile against `useAuth()`/`useCasl()`; typecheck + lint = 0.
- [ ] Full sign-in → org → impersonate → sign-out walk passes against the IdP.
- [ ] No tokens client-side.
