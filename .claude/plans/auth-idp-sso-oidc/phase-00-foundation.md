# Phase 0 — Foundation & D1 wiring

**Goal:** A booting Nuxt 4 + NuxtHub + Cloudflare D1 app with `@onmax/nuxt-better-auth`, email/password enabled, auth tables migrated into local D1, and `/api/auth/*` responding. No OIDC/authz yet.

**Depends on:** nothing. **Unblocks:** all phases.

## Steps

### P0.1 — Install dependencies
```bash
pnpm add @nuxthub/core better-auth
pnpm add -D drizzle-orm drizzle-kit wrangler nitro-cloudflare-dev
npx nuxi module add @onmax/nuxt-better-auth@alpha
```
Expected: `package.json` gains `@nuxthub/core`, `better-auth`, `@onmax/nuxt-better-auth`; dev deps gain drizzle + wrangler + `nitro-cloudflare-dev`. (`nuxi module add` may already append the module to `nuxt.config.ts` — verify in P0.2.)

### P0.2 — `nuxt.config.ts`
Replace the existing file with:
```ts
// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/eslint',
    '@nuxtjs/tailwindcss',
    'nitro-cloudflare-dev',
    '@nuxthub/core',
    '@onmax/nuxt-better-auth',
  ],
  hub: {
    db: 'sqlite', // NuxtHub maps to Cloudflare D1 on deploy; shorthand for { dialect: 'sqlite', driver: 'd1' }
  },
  nitro: {
    preset: 'cloudflare-module',
    cloudflare: { nodeCompat: true },
  },
  runtimeConfig: {
    // server-only secrets (filled by env; see P0.4). NEVER put secrets under `public`.
    public: {
      siteUrl: '', // NUXT_PUBLIC_SITE_URL — used to align the OIDC issuer in P1
    },
  },
})
```
> Per `research/findings.md §A`: do **not** set `database`/`secret`/`baseURL` here or in the auth config — the module injects them.

### P0.3 — `server/auth.config.ts` (minimal)
```ts
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'

export default defineServerAuth(() => ({
  // requireEmailVerification stays OFF until Phase 2 so the P1 slice isn't blocked on email.
  emailAndPassword: { enabled: true },
}))
```

### P0.4 — `app/auth.config.ts` (client, minimal)
```ts
import { defineClientAuth } from '@onmax/nuxt-better-auth/config'

export default defineClientAuth({})
```

### P0.5 — Dev secret + local env
Create `.env` (gitignored already via `.env*`):
```
NUXT_BETTER_AUTH_SECRET=<output of: openssl rand -base64 32>
NUXT_PUBLIC_SITE_URL=http://localhost:3000
```
```bash
openssl rand -base64 32   # paste into NUXT_BETTER_AUTH_SECRET
```

### P0.6 — Boot, generate, migrate
```bash
npx nuxt dev      # boots; module generates schema into .nuxt/better-auth/ and auto-applies to local D1
# in a second terminal, once dev is up:
npx nuxt db generate   # writes server/db/migrations/sqlite/*.sql  — COMMIT these
```
Expected: `server/db/migrations/sqlite/` exists with a `.sql` migration + `meta/_journal.json` containing the core Better Auth tables (`user`, `session`, `account`, `verification`).

## Acceptance criteria
- [ ] `npx nuxt dev` boots with no config errors; module loads.
- [ ] `curl -s http://localhost:3000/api/auth/ok` (or the module's health path) responds; `POST /api/auth/sign-up/email` with `{email,password,name}` returns a session/200.
- [ ] `server/db/migrations/sqlite/*.sql` is generated and committed.
- [ ] Local D1 contains `user`/`session`/`account`/`verification` tables (inspect via `npx nuxt db` tooling or a sign-up round-trip).

## Notes for cook
- If `nuxi module add` pinned a different version, keep `@alpha`.
- If the module errors on `@nuxthub/core` version, ensure `>= 0.10.5`.
- Remember the **restart-after-plugin-change** rule for every later phase.
