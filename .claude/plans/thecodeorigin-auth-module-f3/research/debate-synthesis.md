# Debate synthesis — `thecodeorigin-auth-module-f3`

Three critics (YAGNI, failure-mode/security, architecture) reviewed the pre-debate design (fat sealed cookie holding access+refresh+backup; four new `/rp/*` endpoints incl. `/rp/organizations`; impersonation by naive `oauthAccessToken` row-insert; a module-shipped CASL catalog + role→ability map; a standalone playground; `file:`-dist distribution). Verdicts folded below.

## Accepted (plan changed)

| # | Objection | Source | Resolution |
|---|---|---|---|
| A1 | Org list / entitlement / active-org don't need new endpoints — they belong in **userinfo**. | Arch §P1 | **Accept.** `/rp/organizations` deleted from scope; instead `customUserInfoClaims` gains `organizations[]`. Entitlement/active-org already in userinfo. Net `/rp/*` shrinks to impersonation only. (Phase 1/2.) |
| A2 | Impersonation by inserting token rows is the biggest risk (perpetual via refresh, re-impersonation chaining, admin-target takeover, no audit). | FM §C1–C5, Arch §P0 | **Accept (hardened mint, not 8693).** Mint **non-refreshable** opaque token, **absolute 30-min TTL**, mark row (`referenceId="imp:<adminId>"`), **reject callers whose own token is an impersonation token**, **exclude admins as targets & self**, reuse the **break-glass gate**, add an **`impersonationAudit` table**. RFC 8693 noted as the standards-correct alternative (Open Q1) but deferred — hardened mint is far less work and closes the same holes for a first-party platform. |
| A3 | Fat sealed cookie (access+refresh+full backup) overflows 4KB and exposes IdP tokens if the seal leaks. | FM §C4/H2, Arch §P2 | **Accept.** Switch to **server-side session via Nitro `useStorage()`** (KV on NuxtHub) keyed by an opaque cookie id. Tokens + impersonation backup live server-side; cookie carries only the id. Gives revocation + safe refresh rotation + no size ceiling. nuxt-template already uses KV sessions, so idiomatic. |
| A4 | Module shipping a CASL catalog + role→ability map duplicates the IdP's permission model → drift. | YAGNI §4 | **Accept (middle path).** The **IdP emits the effective `abilities: string[]`** in userinfo (single source of truth, no drift). The module still ships the **CASL build** (`$ability` from the string[]) because the user explicitly requires `useCasl().can` and `@casl/vue` reactivity (Arch §P4 endorses shipping the ability factory). No role→ability map in the module. |
| A5 | Refresh helper is premature **and** must single-flight if kept; impersonation tokens must not refresh. | YAGNI §3, FM §H1/C1 | **Partial accept.** Keep refresh (entitlements/roles are dynamic → Arch §P2), but **server-side, single-flight, retry-once on `invalid_grant`**, and **impersonation tokens are non-refreshable**. |
| A6 | Sign-out only clearing the cookie leaves IdP tokens live; no token revocation. | FM §H3 | **Accept.** `sign-out` revokes the token family (delete the server record + call the IdP end-session/revoke) before clearing the cookie. |
| A7 | Open-redirect via `routes.home`/callback target. | FM §H4 | **Accept.** Post-login redirects are **same-origin, path-only**; reject absolute/`//host`; default to `routes.home`. |
| A8 | PKCE/state cookie hardening + callback must be terminal on `?error`, validate `iss`/`aud`, single-use state. | FM §H6 | **Accept.** state+verifier cookies `HttpOnly; Secure; SameSite=Lax; Path=<callback>`, short Max-Age, host-only; constant-time state compare, delete on use, terminal `?error`, validate `iss`/`aud`/`email_verified`. |
| A9 | Key identity on `sub`, never email; flip-to-unverified must invalidate. | FM §H7 | **Accept.** Session keyed on `sub`; nuxt-template business `user_id` stores `sub` (Open Q2). Refresh re-reads `email_verified`. |
| A10 | SSR session validation must not call the IdP on the hot path (rate-limiter outage landmine, memory [[perf-first-load-plan]]). | FM §M2 | **Accept.** `GET /api/_auth/session` reads the local KV record only; IdP is hit solely when proxying `/rp/*` or refreshing an expired token. |
| A11 | Don't wrap the better-auth client SDK; raw `$fetch` + shared Zod contract. | Arch §P3 | **Accept.** Already the design; contract exported from `@thecodeorigin/auth/contract`, imported by the IdP via the workspace. |
| A12 | `getOrganizations()` returning only this-client's orgs is correct but the name lies. | Arch §P1/Q7 | **Partial.** Keep the user-requested name `getOrganizations` (their API contract) but **document** the per-client scoping in JSDoc + README. |

## Rejected (kept, with reason)

| # | Objection | Source | Why kept |
|---|---|---|---|
| R1 | Drop impersonation + `getImpersonatableUsers` + `switchOrganization` from v1. | YAGNI §1/3, Arch §P0(b) | The user **explicitly listed** `getImpersonatableUsers`, `impersonate`, `impersonator`, and org management in `useAuth()`. Honor it — but hardened (A2) and cheap (`switchOrganization` re-derives from the cached `organizations[]` claim, no IdP round-trip; abilities cosmetic per A4/FM §M4). |
| R2 | Hash `oauthAccessToken` at rest. | FM §H5 | **Reject for the existing table** — better-auth's oauth-provider stores/looks up plaintext; hashing would desync the plugin. Our `requireOAuthToken` matches the plugin's scheme. **Do** scrub `Authorization`/`Cookie` from logs (folded into Phase 2). Minted impersonation tokens follow the same opaque-plaintext scheme for consistency. |
| R3 | Drop the playground; validate only in nuxt-template. | YAGNI §5 | **Reject (mostly).** Keep a **minimal** playground — it already exists in the scaffold and is the module's `pnpm dev` loop / drop-in proof. nuxt-template remains the real acceptance test. |
| R4 | Monorepo / publish now instead of `file:` link. | Arch §P4 | **Defer (Open Q3).** Separate repos make a monorepo out of scope here; `file:` link for dev now, registry publish as the recommended follow-up. The shared contract is still cleanly importable because the module + IdP share the better-auth workspace. |

## Deferred / Open (surfaced in plan.md)
- Open Q1: impersonation mechanism (hardened mint vs RFC 8693) + audit table approval.
- Open Q2: nuxt-template identity re-keying to `sub` (reseed vs backfill).
- Open Q3: distribution (file-link vs registry).
- Open Q4: KV session binding requirement.
