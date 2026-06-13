# Phase 5 — Test backdoors & browser verification harness

**Goal:** Make the system fully browser-testable by an AI agent — **without** building bespoke auth-bypass endpoints (a liability in an auth service, debate #4). The "backdoors" are the capabilities that already exist: deterministic seeded credentials, admin impersonation (dev), and a scoped automation API key. This phase documents and verifies the walkthrough.

**Depends on:** P3 (seed, impersonation, api-key) + P4 (clients). **Unblocks:** P6 confidence.

## Steps

### P5.1 — Test-access doc (`examples/README.md` or `docs/testing.md`)
Document, for the AI agent:
- The seeded test users per role (emails + dev passwords from `seed:idp`).
- The automation API key (read from the seed task log / a dev-only `.dev.vars`, never committed) and how to send it: `x-api-key: <key>` to reach `/api/auth/get-session` as the low-priv test user.
- How to impersonate via the admin UI (dev only) and that it is **disabled in prod** (P6).
- The ports: IdP :3000, clients :3001-3004.

### P5.2 — Chrome DevTools MCP walkthrough (scripted, repeatable)
Document the exact agent steps (this is what the `verify` skill runs). Each is a `chrome-devtools` MCP action:
1. **Auth basics:** navigate :3000 `/sign-up` → register → verify email link (dev) → `/sign-in` → land authenticated.
2. **Social:** click "Continue with Google"/"GitHub" (or document test accounts).
3. **SSO proof (the headline test):** with the IdP session live, navigate :3001 → sign in → no credential prompt → user shown. Repeat :3002, :3003, :3004. Screenshot each showing the same `sub`/email.
4. **Public-client PKCE:** confirm the Vue SPA (:3004) logs in with no secret.
5. **Authorization matrix:** via admin UI, impersonate a `member` → confirm a `project:delete` action is denied and `project:read` allowed; impersonate `owner` → both allowed. Then exercise the **dynamic** `project-viewer` role.
6. **API-key automation:** scripted request with `x-api-key` returns the test user's session.
7. **Logout behavior:** sign out at the IdP; document that RP local sessions persist until their own TTL (cross-domain single-logout is not automatic — debate H3); note front-channel logout as a follow-up if required.

### P5.3 — Safety-net checks
```bash
pnpm typecheck   # or: npx nuxt typecheck
pnpm lint
# OIDC integration check: scripted oauth4webapi flow (reuse examples/vue/auth.ts) against :3000
```

## Acceptance criteria
- [ ] An AI agent can, from the doc alone, drive a full SSO loop across all 4 clients in a browser and capture screenshots.
- [ ] The authorization matrix (member vs owner vs dynamic role) behaves as defined, observed through impersonation.
- [ ] API-key automation authenticates as the low-priv test user.
- [ ] No bespoke auth-bypass endpoint was added; all testing uses impersonation + seed + api-key.
- [ ] `typecheck` and `lint` pass; the scripted OIDC flow succeeds.

## Notes for cook
- If a real cross-root-domain logout guarantee is needed, scope a follow-up: per-RP front-channel logout endpoints + IdP `end_session_endpoint` fan-out. Out of scope here; document the current behavior honestly.
