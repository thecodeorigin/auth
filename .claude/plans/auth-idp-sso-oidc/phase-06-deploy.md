# Phase 6 — Production deployment hardening

**Goal:** Take the smoke-deployed Worker (P1) to a hardened production posture on `auth.example.com`: secrets out of the repo, non-plain client-secret storage, real domains, email DNS auth, impersonation locked down, and a safe migration process. Final SSO loop verified against prod.

**Depends on:** P1-P5. **Unblocks:** launch.

## Steps

### P6.1 — Secrets → Workers secrets (never committed; debate C4/CF4)
Set on the deployed Worker (NuxtHub dashboard or `wrangler secret put`):
- `NUXT_BETTER_AUTH_SECRET`, `NUXT_PUBLIC_SITE_URL=https://auth.example.com`
- Social: `NUXT_GOOGLE_CLIENT_ID/SECRET`, `NUXT_GITHUB_CLIENT_ID/SECRET`
- OIDC client secrets: `NUXT_OIDC_EXPRESS_SECRET`, `NUXT_OIDC_NEXT_SECRET`, `NUXT_OIDC_NUXT_SECRET` (vue-spa is public, no secret)
- `NUXT_ADMIN_USER_IDS` (explicit allowlist), `NUXT_SEED_ADMIN_EMAIL`
- Email binding/credentials per the `cloudflare-email-service` skill.
Confirm none of these are under `runtimeConfig.public` (would leak to the client bundle).

### P6.2 — Non-plain client secret storage (debate C3)
Confirm `oidcProvider({ storeClientSecret: 'encrypted' })` (or the verified enum) is active in prod and that existing rows aren't plaintext. If dynamic registration is enabled, treat returned secrets as one-time-shown.

### P6.3 — Production domains
- `oidcProvider.trustedClients[*].redirectURLs` → real callback URLs: `https://foo.example.com/...`, `https://bar.another.com/...`, `https://baz.third.com/...`, + 4th. Keep **separate** dev vs prod registrations (debate H1).
- `trustedOrigins` → the real RP origins.
- Google/GitHub OAuth apps → add prod redirect URIs (`https://auth.example.com/api/auth/callback/google|github`).
- `NUXT_PUBLIC_SITE_URL` and `jwt.issuer` both `https://auth.example.com/api/auth`.
- DNS: `auth.example.com` → the Worker (custom domain / route).

### P6.4 — Email DNS auth (debate CF2/E1)
Configure SPF, DKIM, DMARC for the sending domain so verification/reset mail isn't spam-filtered (→ otherwise users "can't sign up"). Use the `cloudflare-email-service` skill. Confirm sends happen via `waitUntil`.

### P6.5 — Lock down impersonation (debate C6, Open Q#3)
Gate `admin()` impersonation to non-prod, or require a break-glass flow in prod. Restrict `adminUserIds` to the explicit allowlist (not role-only) in prod. The AI agent uses a **non-admin** identity for normal tests.

### P6.6 — Safe migration process (debate D1)
- Hand-review every `server/db/migrations/sqlite/*.sql` before deploy; ensure **no destructive** drops/renames on live `user`/`session`/`oauthApplication`/`jwks`/`organization*` tables.
- Snapshot/export prod D1 before deploy; keep the migration ledger (`meta/_journal.json`) committed.
- Deploy: `npx nuxthub deploy` (applies migrations remotely). If manual control is needed, set `applyMigrationsDuringBuild: false` and apply deliberately.

### P6.7 — Seed prod
Run `seed:idp` against prod once (idempotent) to create the system admin + demo org/roles. Rotate the printed automation key; do not reuse dev keys.

## Acceptance criteria
- [ ] `https://auth.example.com/api/auth/.well-known/openid-configuration` is live, RS256, issuer `https://auth.example.com/api/auth`.
- [ ] A full OIDC login loop works from at least one prod-domain client; an `id_token` verifies against the live JWKS.
- [ ] `git grep` for secrets finds **none** in the repo; all are Workers secrets; `storeClientSecret` is non-plain.
- [ ] Impersonation is disabled/break-glass in prod; `adminUserIds` is an explicit allowlist.
- [ ] Verification + reset emails deliver to inbox (not spam); SPF/DKIM/DMARC pass.
- [ ] The applied prod migration matches the reviewed SQL; prod D1 has all expected tables.

## Notes for cook
- Re-confirm Open Q#1 (plugin) and Q#3 (impersonation) decisions are reflected before launch.
- This is hardening, not first-deploy — the Worker already ran in P1.
