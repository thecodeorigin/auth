# Plan — `auth.example.com`: Better Auth OIDC Identity Provider on Cloudflare Workers

**Status:** ready for `cook` (read open questions first)
**Impact:** High — greenfield, multi-table schema, new architecture, 7 phases, ~1 IdP app + 4 demo client apps.
**Stack:** Nuxt 4 + `@onmax/nuxt-better-auth` (alpha) + Better Auth `1.6.x` + NuxtHub + Cloudflare D1, deployed to Cloudflare Workers.

---

## ⚠️ Open questions (resolve before/at start of cook — do not bury)

These do **not** block starting Phase 0. They are decisions surfaced by the architecture debate; defaults are chosen so cook can proceed, but the user may veto.

1. **OIDC plugin choice — `oidcProvider` (deprecated) vs `@better-auth/oauth-provider` (successor).**
   `oidcProvider` is deprecated in `better-auth@1.6.16` (runtime warning) but is what every verified snippet in this plan targets. The successor exposes the *same endpoints* but its option surface is unverified.
   **Default:** build on `oidcProvider`, with a **Phase-1 spike (step P1.0)** that installs `@better-auth/oauth-provider`, diffs its options against the config in `phase-01`, and switches if it's a clean swap. If the spike shows API drift or thin docs, stay on `oidcProvider` and pin the better-auth version.

2. **Alpha module `@onmax/nuxt-better-auth` as a load-bearing dependency of the source of truth.**
   The architecture critic recommends mounting plain Better Auth in a Nitro route to avoid coupling the IdP to an alpha module. **Default:** keep the module — it provably solves D1 binding, schema generation, and the Cloudflare preset (see `research/findings.md`), and the user selected it. Mitigation: the module is thin sugar over `auth.handler`; if it blocks a phase, the fallback is a plain `server/api/auth/[...all].ts` Nitro route mounting `betterAuth(...)` directly. Documented in `research/findings.md §Fallback`.

3. **Production impersonation policy.** Admin impersonation is the cheapest browser-test backdoor but a prod liability. **Default:** enabled in dev/preview, **disabled (or break-glass only) in production** (Phase 6). Confirm acceptable.

4. **Local multi-domain simulation.** Different root domains can't be reproduced on one localhost. **Default:** run the 4 clients on `localhost:3001-3004` in dev (origin isolation is enough to prove independent OIDC sessions); use real domains only in prod (Phase 6). A `hosts`-file mapping (`foo.localtest.me` etc.) is offered as an optional upgrade in `phase-04`.

---

## Goal

Stand up `auth.example.com` as the **single source of truth for authentication and authorization** for a company's app ecosystem. Users authenticate once at `auth.example.com`; the 4 apps — on **different root domains** (`foo.example.com`, `bar.another.com`, `baz.third.com`, + a 4th) — federate via **OpenID Connect** (Authorization Code + PKCE), each registered as an OAuth client on an allowlist. The IdP also owns authorization (admin RBAC, organizations with dynamic/ability-based access control, API keys for automation). It must deploy to Cloudflare Workers on D1 and be fully browser-testable by an AI agent.

## Why OIDC (the spine — settles the brief's mixed model)

The brief mixes two mechanisms: "log in once, reach all apps" (SSO) and "give each app a client_id/client_secret/redirect_url" (OAuth provider). Because the apps live on **different registrable root domains**, cookie-based SSO is **physically impossible** (a `Domain=.example.com` cookie is never sent to `another.com`; third-party-cookie bridging is blocked by Safari ITP / Chrome). The only correct mechanism — and exactly what "client_id/secret/redirect_url per app" describes — is making `auth.example.com` an **OIDC Provider**. Each app runs its own OIDC code flow; the shared thing is the **IdP session**, so the 2nd/3rd/4th app's `/authorize` returns without re-login. Each app then mints its **own** local session from the issued tokens.

**Design principle (from architecture debate Q5):** centralize *definition* (roles/orgs/permissions live in the IdP), decentralize *enforcement* (apps enforce locally against claims carried in the OIDC token via `getAdditionalUserInfoClaim`, not a synchronous call to the IdP per request).

---

## Approach (sequencing front-loads the two hardest risks)

Risk-first ordering per the YAGNI debate: the genuinely hard, unprovable-on-paper things are (a) the OIDC loop across origins and (b) Cloudflare Workers runtime quirks (cookies, crypto, issuer URL, per-request D1). Phase 1 proves **both** with a thin vertical slice and an **early smoke-deploy**, before any polish (email, social, full authz, remaining clients) is layered on.

| Phase | Name | Impact | Schema change | File |
|---|---|---|---|---|
| 0 | Foundation & D1 wiring | base | core auth tables | `phase-00-foundation.md` |
| 1 | OIDC vertical slice + CF smoke-deploy | high (de-risk) | +jwks, oidc tables | `phase-01-oidc-slice.md` |
| 2 | Authentication hardening (email verify/reset, Google, GitHub, UI) | med | (accounts/verification) | `phase-02-auth-hardening.md` |
| 3 | Authorization (admin, org + dynamic AC, api-key, claims, seed) | high | +admin/org/role/apikey tables | `phase-03-authorization.md` |
| 4 | Remaining demo clients (next, nuxt, vue) | med | none | `phase-04-demo-clients.md` |
| 5 | Test backdoors & browser verification harness | low | none | `phase-05-test-harness.md` |
| 6 | Production deployment hardening | med | none | `phase-06-deploy.md` |

---

## Cross-phase file map

**IdP app (repo root):**
- `nuxt.config.ts` — modules, `hub.db` (sqlite/d1), nitro `cloudflare-module` preset, `runtimeConfig` (P0; extended P1-P3).
- `server/auth.config.ts` — the Better Auth config; grows one plugin block per phase (P0→P3). **Restart dev after every change** (schema regenerates at module-setup).
- `app/auth.config.ts` — client plugins (`adminClient`, `organizationClient`, `apiKeyClient`) (P0, P3).
- `server/utils/permissions.ts` — `createAccessControl` statement + static roles (P3). *(This is the project's permission catalog — the single source of ability keys.)*
- `server/utils/email.ts` — Cloudflare email send helper (P2).
- `server/db/migrations/sqlite/*.sql` — generated, **committed, hand-reviewed** (every phase that changes schema).
- `server/tasks/seed/idp.ts` — idempotent Nitro seed: system admin, demo org, roles, 4 OAuth clients, deterministic test users (P3).
- `app/pages/sign-in.vue`, `sign-up.vue`, `forgot-password.vue`, `reset-password.vue`, `verify-email.vue`, `oauth/consent.vue` (P1-P2).
- `app/pages/admin/users.vue` (+ minimal admin shell) (P3).
- `.dev.vars` / `.env` (dev secrets, gitignored) + `wrangler` secrets (prod, P6).

**Demo clients (`examples/`):**
- `examples/express/` — `openid-client@^6` + `express-session` (P1 first client; finalized P4).
- `examples/next/` — `next-auth@5` custom OIDC provider (P4).
- `examples/nuxt/` — `nuxt-oidc-auth` generic `oidc` provider (P4).
- `examples/vue/` — `oauth4webapi@^3` public SPA client, PKCE-only (P4).

See `research/findings.md` for verified config snippets and the exact migration command sequence.

---

## Test strategy

- **Per-phase acceptance** is browser- or curl-verifiable (each phase file lists concrete checks).
- **The hard invariant** (verified at P1 and again P4/P5): log in at the IdP once → a *second* client's `/authorize` completes **without** a second credential prompt → each client shows the same user. That is the SSO proof.
- **Authorization matrix** (P5): use `apiKey` + admin **impersonation** to drive the browser as each role; assert dynamic-AC role grants/denies the seeded ability.
- **Safety net** (P5/P6): `pnpm typecheck`, `pnpm lint`, the OIDC discovery/JWKS/token integration check, and a scripted `oauth4webapi` flow against the deployed Worker.
- **Verification tooling:** Chrome DevTools MCP walkthrough documented in `phase-05`; the `verify` skill runs it after cook completes each browser-facing phase.

---

## Acceptance criteria (whole plan)

1. `auth.example.com` (and the local dev server) exposes a valid OIDC discovery doc at `/api/auth/.well-known/openid-configuration` with `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `jwks_uri`, and `id_token_signing_alg_values_supported: ["RS256"]`.
2. A real `id_token` issued to a client is **RS256**, with a `kid` present in `/api/auth/jwks` (proves `useJWTPlugin` works — see debate C1/C2).
3. Sign-in works via email+password (with verification + reset), Google, and GitHub.
4. All 4 demo clients complete login via the IdP; logging in once makes the other 3 authenticate **without** re-entering credentials.
5. Admin can list users, set roles, and impersonate (dev). An org can be created; a **dynamically created custom role** grants/denies a seeded ability (CASL-style), enforced via `hasPermission` and reflected in token claims.
6. An automation client authenticates with an API key (scoped to a low-priv test user) and drives a session.
7. The whole thing is deployed to Cloudflare Workers on D1; the discovery doc and a full SSO loop work against the deployed URL.
8. Client secrets, social secrets, and API keys are Workers secrets — **none committed**; `storeClientSecret` is non-plain; impersonation is disabled/break-glass in prod.

---

## Suggested cook invocation

```
/cook .claude/plans/auth-idp-sso-oidc/plan.md
```
Start at `phase-00-foundation.md`. **Read `research/findings.md` and `research/debate-synthesis.md` first** — they hold the verified migration recipe and the security fixes that are baked into every phase. Execute phases in order; do not skip the P1 smoke-deploy (it de-risks everything after it).
