# Debate synthesis

Three critics (YAGNI/KISS, failure-mode/security, architecture) ran in parallel against the architecture + phase outline. For each material objection: **Accept** (plan changed), **Reject** (kept, with reason), or **Defer** (open question). The failure-mode critic verified findings against the installed `better-auth@1.6.16` source — those are high-confidence and folded into `findings.md` + the phase configs.

## Architecture critic

| # | Objection | Verdict | Action |
|---|---|---|---|
| Q1 | OIDC Provider is the right mechanism for cross-root-domain SSO (cookies confirmed impossible; `sso` plugin is the inverse; bespoke JWT = reinventing OIDC; commercial IdP is the real alt for prod). | **Accept (confirms approach)** | OIDC kept as the spine. Strategic flag recorded: for real production identity, re-open buy-vs-build (WorkOS/Zitadel) — noted in plan, not actioned. |
| Q2 | Build on successor `@better-auth/oauth-provider`, not deprecated `oidcProvider`. | **Defer → Open Q#1** | Plan targets `oidcProvider` (only verified surface) with a Phase-1 spike (P1.0) to adopt the successor if it's a clean swap. |
| Q3 | Don't make alpha `@onmax/nuxt-better-auth` load-bearing; use plain Better Auth in a Nitro route. | **Reject → Open Q#2** | User chose the module; it provably solves D1/schema/CF wiring. Documented fallback to a plain Nitro handler in `findings.md §Fallback`. |
| Q4 | Monorepo `examples/` is correct for the demo clients. | **Accept (confirms)** | Clients stay in `examples/`; depend only on the IdP's public OIDC surface. |
| Q5 | Consolidating authn+authz is correct for "single source of truth" **iff** you split centralized definition from app-local enforcement. | **Accept** | Added design principle: roles/orgs defined in IdP, enforced in apps via token claims (`getAdditionalUserInfoClaim`), not per-request IdP calls. Manage dynamic-AC staleness via short token TTL / userinfo. |

## Failure-mode / security critic (verified against source)

| # | Severity | Finding | Verdict | Action |
|---|---|---|---|---|
| C1 | CRITICAL | ID tokens default HS256-signed-with-client-secret; JWKS unused. | **Accept** | `oidcProvider({ useJWTPlugin: true })` mandatory (P1). Acceptance criterion #2 asserts RS256 + kid. |
| C2 | CRITICAL | jwt plugin defaults EdDSA; many RP libs can't verify. | **Accept** | Pin RS256 keyPairConfig (P1). Decide before clients integrate. |
| C3 | CRITICAL | `storeClientSecret` defaults `"plain"`. | **Accept** | Set non-plain (P1, VERIFY enum); secrets to Workers secrets (P6). |
| C4 | CRITICAL | trustedClients inline secrets + blanket skipConsent. | **Accept** | Secrets from `runtimeConfig` (P1/P6); skipConsent only for first-party demo clients, documented per-client. |
| C5 | CRITICAL | `apiKey`/`enableSessionForAPIKeys` not in installed core. | **Accept** | P3.0 installs/verifies `@better-auth/api-key` before use; automation keys scoped to a low-priv test user. |
| C6 | CRITICAL | Admin impersonation backdoor + AI agent → prod takeover risk. | **Accept → Open Q#3** | Impersonation dev/preview only, disabled/break-glass in prod (P6). AI agent gets a non-admin identity for normal tests (P5). |
| H1 | HIGH | redirect_uri matching — **safe** (exact-string match), but brittle (trailing slash/port). | **Accept (partial)** | Register canonical URIs precisely; keep dev/prod client registrations separate (P4/P6). |
| H2 | HIGH | `plain` PKCE still honored. | **Accept** | `requirePKCE: true` + restrict to S256 (P1). |
| H3 | HIGH | Cross-domain SSO ≠ shared cookies; single-logout not free. | **Accept** | Documented in plan (Why OIDC). P5 tests the SSO loop + documents logout behavior; RP session TTL guidance + front-channel logout noted as follow-up. |
| H4 | HIGH | CORS/trustedOrigins for the public SPA across domains. | **Accept** | Enumerate all 4 RP origins in `trustedOrigins` (P2); cookies `Secure`+`SameSite=Lax`; prefer redirect flow over credentialed cross-origin fetch. |
| CF1 | HIGH | JWKS key regeneration per request would break verification. | **Accept** | Confirm `jwks` table persistence; no global auth-instance cache (P1, noted in findings A). |
| CF2 | HIGH | Email from Workers: no SMTP; send via `waitUntil`; SPF/DKIM/DMARC. | **Accept** | P2 uses Cloudflare Email Service skill; send in `waitUntil`; P6 sets DNS auth. |
| CF3/CF4 | MED | Deprecated plugin risk; secrets must be Workers secrets not committed. | **Accept** | Covered by Open Q#1 + P6 secrets step. |
| D1 | HIGH | Local↔remote D1 schema drift; non-transactional migrations. | **Accept** | Hand-review every migration; snapshot D1 before deploy; migration ledger (P6 checklist). |
| D2 | MED | dynamic-AC roles stored as JSON; parse failure → lockout/fail-open. | **Accept** | Validate ability JSON with Zod on write; permission checks **fail closed**; seed via idempotent task (P3). |
| D3 | MED | Seed idempotency (system admin, 4 clients). | **Accept** | Seed uses `onConflictDoUpdate` on stable keys (clientId/email) (P3). |
| E1 | HIGH | Email-failure lockout (verification/reset). | **Accept** | Resend-verification + rate-limited resend-reset endpoints; admin manual-verify (guarded); decide unverified-account handling (P2). |
| E2 | MED | Token reuse/lifetime; reset must invalidate sessions. | **Accept** | Confirm single-use short-lived tokens; password reset revokes sessions; email-change token bound to user+target (P2). |

## YAGNI / KISS critic

| # | Proposed cut | Verdict | Action |
|---|---|---|---|
| 1 | Reorder: prove cross-domain OIDC SSO + CF smoke-deploy first. | **Accept** | Restructured to Phase-1 vertical slice + early smoke-deploy. The single most impactful change. |
| 2 | Cut email (verify/reset/Cloudflare Email) to a stub. | **Reject** | User explicitly chose email verification+reset. Kept in P2 (but P1 runs with `requireEmailVerification` off to unblock the slice). |
| 3 | Cut Google+GitHub social. | **Reject** | User explicitly chose both. Kept in P2. |
| 4 | No custom test harness — reuse impersonation+seed+api-key + one markdown walkthrough. | **Accept** | P5 is a documented walkthrough + the seed, not bespoke backdoor endpoints (which would be an auth-bypass liability). |
| 5 | Clients 2-4 = ~50-line SSO probes, not full apps. | **Accept** | P4 clients are minimal probes (login → show user). One reference client (express, P1) is slightly fuller. |
| 6 | Org dynamic-AC: one ability statement, 2 roles, prove mechanism once. | **Accept** | P3 defines a small statement (2-3 resources) + owner/member + one dynamically-created role. No full matrix/role-CRUD UI. |
| 7 | Admin dashboard: users list only; manage clients/roles/keys via config+seed. | **Accept** | P3 ships only `admin/users.vue` (list + impersonate + set role). Clients/roles/keys via seed + config. |
| 8 | Skip consent page if trusted clients bypass it. | **Accept (partial)** | Demo clients use `skipConsent`; a minimal consent page is still built (P1) for any non-trusted/future client. Low priority. |
| 9 | Smoke-deploy to CF early, not only at the end. | **Accept** | P1 includes the first Workers deploy; P6 is hardening, not first-deploy. |

## Net effect on the plan
- Phases resequenced to **risk-first** (OIDC slice + deploy in P1).
- Security defaults (C1-C4, H2, CF1) are **in the P1 config**, not deferred.
- `@better-auth/api-key` existence (C5) verified at **P3.0** before use.
- Scope of authz depth, admin UI, test harness, and clients 2-4 **minimized** per YAGNI without dropping any user-requested capability.
- Two architectural forks parked as **Open Q#1/#2** with chosen defaults + spike/fallback, so cook is never blocked.
