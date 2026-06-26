# `@thecodeorigin/auth` — headless OIDC relying-party module

**Plan id:** `thecodeorigin-auth-module-f3`
**Repos:** `D:\projects\better-auth` (IdP + the module package under `packages/auth`) and `D:\projects\nuxt-template` (first consumer).
**Impact:** High — new architecture, two repos, IdP schema add (1 table), ~12 new module files, ~40 deletions + rewires in nuxt-template.

---

## Goal

Package the OIDC relying-party integration into a drop-in Nuxt module so any first-party app can do:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@thecodeorigin/auth'],
  auth: {
    domain: 'auth.thecodeorigin.com',   // NUXT_THECODEORIGIN_DOMAIN
    clientId: '',                        // NUXT_THECODEORIGIN_CLIENT_ID
    clientSecret: '',                    // NUXT_THECODEORIGIN_CLIENT_SECRET
    routes: { signIn: '/auth/sign-in', callback: '/auth/callback', signOut: '/auth/sign-out', home: '/', error: '/auth/sign-in' },
  },
})
```

```ts
const { session, user, abilities, isImpersonating, impersonator,
        getOrganizations, switchOrganization,
        getImpersonatableUsers, impersonate, stopImpersonating,
        signOut, refresh } = useAuth()
const { can, cannot, ability } = useCasl()
```

The module is **headless** (routes / utils / composables / middleware / plugins — **no Vue components, no business DB tables**). The IdP (`auth.thecodeorigin.com`) stays the single source of truth; the app calls it over OIDC + a small number of access-token-protected reads. nuxt-template then deletes its entire local auth/org subsystem and consumes the module.

---

## Open questions (resolve before / during cook — do NOT let cook decide silently)

1. **Impersonation mechanism & audit table (security-strategic).** The plan implements RP impersonation by having the IdP **mint a short-lived, non-refreshable opaque access token for the target user** (Phase 2), gated to system admins, reusing the existing break-glass gate (`NUXT_ALLOW_IMPERSONATION`), with admins excluded as targets, re-impersonation rejected, and a new `impersonationAudit` table for the trail. This satisfies the user's `impersonate`/`getImpersonatableUsers` requirement while closing the debate's C1–C5 holes.
   - **Confirm:** OK to expose impersonation through the RP module (vs keeping it only in the IdP-origin console)? OK to add the `impersonationAudit` table (one migration)?
   - **Alternative on file:** RFC 8693 token-exchange with an `act` claim (more standards-correct, more work) — see `research/debate-synthesis.md` §P0.
2. **nuxt-template identity re-keying.** Business rows currently FK to the local `userTable.id` (a local nanoid). After the local user/org tables are removed, `user_id`/`organization_id` columns must store the **IdP `sub` / org id**. Is there real data to migrate, or can dev data be **reseeded** under IdP ids? (If prod data exists, a `sub`-mapping backfill task is required — out of current scope; flag it.)
3. **Module distribution.** For this effort, nuxt-template consumes the module via a local `file:` link (`"@thecodeorigin/auth": "file:../better-auth/packages/auth"`, sibling dirs confirmed: `D:\projects\better-auth`, `D:\projects\nuxt-template`). Publishing to a private registry with semver is the recommended follow-up (see debate §P4). **Confirm** file-link is acceptable for now.
4. **Session storage backend.** Sessions are stored server-side via Nitro `useStorage()` (opaque id in an httpOnly cookie; tokens never reach the browser). On NuxtHub/Cloudflare this is a **KV binding**; in dev it falls back to memory. Not a business table — but it is a required binding. **Confirm** acceptable.

---

## Architecture (decided)

- **Transport:** OIDC Authorization-Code + **PKCE (S256)**, confidential client (`client_secret_basic`). Login = the module's `signIn` server route 302s to the IdP hosted login; callback exchanges the code and calls `/oauth2/userinfo`.
- **Claims source = userinfo.** The IdP's `customUserInfoClaims` is enriched (Phase 1) to return, scoped to the requesting `clientId`:
  - `organizations: { id, slug, name, role, personal }[]` — the full set of orgs this client may act in (per-app access-grant scoping, reusing `claimsResolve`'s candidate logic).
  - `abilities: string[]` — effective `subject:action` grants for the active role (computed on the IdP from `#shared/permissions`, so the module never duplicates the catalog → no drift).
  - `role: string | null` — the user's **system** role (so the RP knows a platform admin → CASL `manage all`).
  - existing `org`, `roles`, `personal`, `entitlement` keep working untouched.
- **No new endpoints for orgs/entitlement** — they ride userinfo. Only impersonation needs new IdP routes (Phase 2): `GET /api/auth/rp/impersonatable-users`, `POST /api/auth/rp/impersonate`, `POST /api/auth/rp/stop-impersonating`, plus a `requireOAuthToken` bearer verifier (lookup in `oauthAccessToken`, matching better-auth's plaintext-opaque scheme).
- **Session = server-side record + opaque cookie.** Nitro `useStorage()` holds `{ sub, user, claims, abilities, systemRole, organizations, activeOrg, entitlement, accessToken, refreshToken, accessExpiresAt, impersonator?, backupId? }`. The cookie holds only the opaque session id. Tokens stay server-only (closes debate C4/H2). Revocation = delete the record.
- **Refresh** is server-side, single-flight, on-401-retry-once (Phase 5). Impersonation tokens are **non-refreshable** → expiry forces stop-impersonating (closes C1).
- **CASL** lives in the module: an ability plugin builds `$ability` from `session.abilities` (+ system admin → `manage all`); `useCasl()` exposes `{ can, cannot, ability }`; a global `casl` middleware gates `definePageMeta({ can: [...] })`. Authority is always the server — `$ability` is cosmetic (project hard-rule).
- **Wire contract** = Zod schemas exported from the module subpath `@thecodeorigin/auth/contract` (pure, no Nuxt deps). The IdP imports them via the workspace (the module lives in the same pnpm workspace as the IdP), keeping `customUserInfoClaims` and the `/rp/*` routes type-locked to the module. nuxt-template gets runtime validation at the boundary.
- **No better-auth client SDK in the module** — raw `$fetch` + Zod. Avoids the `@better-fetch/fetch` skew + `@polar-sh/better-auth` dedup landmines (memory: [[polar-dep-dedup-gotcha]]).

```
Browser ──signIn 302──▶ IdP /oauth2/authorize ──login──▶ callback
   ▲                                                        │ code→token, userinfo
   │  opaque session-id cookie (httpOnly)                   ▼
nuxt-template (RP)  ◀── useState(session) ◀── KV session record (tokens server-only)
   │ useAuth().getOrganizations()  → reads cached userinfo claim (no IdP call)
   │ useAuth().impersonate(id)      → /api/_auth/* proxy → IdP /api/auth/rp/* (Bearer)
   └ useCasl().can()                → $ability from session.abilities
```

---

## Phase table

| Phase | Repo | Title | Depends on | File | Status |
|---|---|---|---|---|---|
| 1 | better-auth | IdP userinfo claims (orgs/abilities/role) + shared contract | — | `phase-01-idp-claims-contract.md` | ✅ done |
| 2 | better-auth | IdP RP impersonation endpoints (hardened) + audit table | 1 | `phase-02-idp-rp-impersonation.md` | ✅ done |
| 3 | better-auth/packages/auth | Module core: config, OIDC flow, KV session store | 1 | `phase-03-module-core-session.md` | ✅ done |
| 4 | better-auth/packages/auth | Composables (`useAuth`/`useCasl`), CASL plugin, middleware | 3 | `phase-04-module-composables-casl.md` | ✅ done |
| 5 | better-auth/packages/auth | Proxy routes (orgs/switch/impersonation) + refresh helper | 2,4 | `phase-05-module-proxies-refresh.md` | ✅ done |
| 6 | both | Playground smoke + module build/link + proofs | 5 | `phase-06-playground-verify.md` | ✅ done |
| 7 | nuxt-template | Refactor: delete auth layer, consume module, drop FKs, rewire | 6 | `phase-07-nuxt-template-refactor.md` | ✅ done |

Phases 1–2 (IdP) and 3–5 (module) can be developed in parallel against the Zod contract from Phase 1; Phase 5 needs Phase 2 live to test impersonation.

---

## Cross-phase file map

**IdP (better-auth) — new/edited**
- `shared/auth-contract.ts` *(or import from the module — see Phase 1)* — claim Zod schemas + `abilitiesForRole`.
- `server/services/claims.ts` — add `claimsResolveAll(userId, clientId)`.
- `server/services/rp.ts` *(new)* — `requireOAuthToken`, `isSystemAdmin`, `impersonatableUsersPage`, `mintImpersonationToken`, `revokeOAuthToken`, audit writes.
- `server/auth.config.ts` — enrich `customUserInfoClaims` (orgs/abilities/role).
- `server/api/auth/rp/impersonatable-users.get.ts`, `impersonate.post.ts`, `stop-impersonating.post.ts` *(new)*.
- `server/middleware/impersonation.ts` — also gate `/api/auth/rp/impersonate`.
- `.nuxt/better-auth`-adjacent schema: add `impersonationAudit` table (Phase 2) → `nuxi db generate`.
- `examples/rp-proof.mjs` *(new)* — proves the orgs claim + impersonation loop.

**Module (`packages/auth/src`) — new**
- `module.ts` (rewrite scaffold), `contract/index.ts`,
- `runtime/server/utils/{oidc,session,idp}.ts`,
- `runtime/server/routes/{sign-in.get,callback.get,sign-out.get}.ts`,
- `runtime/server/api/_auth/{session.get,organizations.get,impersonatable-users.get,impersonate.post,stop-impersonating.post}.ts`, `runtime/server/api/_auth/organizations/switch.post.ts`,
- `runtime/app/composables/{useAuth,useCasl}.ts`,
- `runtime/app/plugins/{0.session,ability}.ts`,
- `runtime/app/middleware/{auth.global,casl.global}.ts`,
- `runtime/shared/permissions.ts` (CASL subjects/actions typing).

**nuxt-template — deletions + rewires** (full inventory in Phase 7).

---

## Test / verification strategy (oracles)

- `pnpm lint` + `pnpm exec nuxi typecheck` = 0 in **both** repos and the module package (`pnpm --filter @thecodeorigin/auth test:types`).
- IdP proofs: existing `node examples/sso-proof.mjs` + `authz-proof.mjs` still pass; **new** `node examples/rp-proof.mjs` proves: userinfo returns `organizations[]`+`abilities[]`+`role`; `/rp/impersonatable-users` 403s for non-admins and excludes admins; `/rp/impersonate` mints a non-refreshable token; re-impersonation is rejected.
- Module: `pnpm --filter @thecodeorigin/auth dev` (playground) → full OIDC loop against dev IdP (localhost:3000), `useAuth().session` populated, `getOrganizations()` returns the granted list, `useCasl().can()` matches abilities, impersonate/stop works.
- nuxt-template: `pnpm exec nuxi typecheck` = 0; live browser walk (Chrome DevTools MCP) of sign-in → dashboard → org switch → impersonate → stop → sign-out; confirm no references to deleted `useAuthStore`/`useAuthApi`.

## Acceptance criteria

- [ ] A fresh app adding `modules: ['@thecodeorigin/auth']` + the `auth` config + a KV binding gets working `useAuth()`/`useCasl()` with zero local auth tables.
- [ ] userinfo returns per-client `organizations[]`, `abilities[]`, system `role`; existing claims unchanged; `sso-proof`/`authz-proof` green.
- [ ] Impersonation: admin-only, admins excluded as targets, non-refreshable, audited, break-glass-gated; re-impersonation rejected.
- [ ] Session tokens never appear in any browser-visible cookie/response.
- [ ] nuxt-template has **no** `layers/auth/server/db` auth tables and **no** `.references(() => userTable.id)`; business `user_id`/`organization_id` columns retained as plain text; all auth call sites compile against `useAuth()`/`useCasl()`.
- [ ] Both repos: lint + typecheck = 0.

See `research/debate-synthesis.md` for the full decision trace.
