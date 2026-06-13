# Verified findings (source-grounded)

Two research subagents verified these against the module's GitHub source and the **installed** `better-auth@1.6.16` dist in `node_modules`. Treat as ground truth; re-verify only the items flagged "VERIFY".

## A. Migration / database wiring — `@onmax/nuxt-better-auth` + NuxtHub D1

**You do NOT run the Better Auth CLI.** The module generates the Drizzle schema for *all* configured plugin tables at **module-setup time** and wires Better Auth's `database` itself via the `#auth/database` virtual module (drizzleAdapter over the NuxtHub `db`, `provider: 'sqlite'`). It registers a `hub:db:schema:extend` hook so NuxtHub's drizzle-kit picks up the auth tables.

**Exact command sequence:**
```bash
# 1. install
pnpm add @nuxthub/core better-auth
pnpm add -D drizzle-orm drizzle-kit wrangler nitro-cloudflare-dev
# 2. edit nuxt.config.ts (hub.db) + server/auth.config.ts (plugins)
# 3. start dev — schema is generated into .nuxt/better-auth/, migrations auto-apply to LOCAL D1
npx nuxt dev
# 4. create committable migration SQL from the generated schema
npx nuxt db generate           # -> server/db/migrations/sqlite/*.sql (drizzle-kit under the hood)
# 5. apply (auto on dev; force with)
npx nuxt db migrate
# 6. production (remote D1): migrations auto-apply on deploy
npx nuxthub deploy
```

**Rules / gotchas:**
- **RESTART the dev server after adding/removing ANY plugin** — schema is generated at setup, not watched. Then re-run `npx nuxt db generate`. (This is why the plan adds plugins phase-by-phase and regenerates each time.)
- **Never set `database`, `secret`, or `baseURL`** in `defineServerAuth` — the module injects all three. Setting `database` breaks the managed adapter.
- **Never run `npx @better-auth/cli generate`** in this flow — it emits a conflicting root `schema.ts`.
- `@nuxthub/core` must be **≥ 0.10.5** (playground pins `^0.10.6`).
- D1 binding is per-request; the sqlite branch's `createDatabase()` takes no event arg — NuxtHub's `@nuxthub/db` `db` export resolves the binding from Cloudflare request context. The module builds a fresh (uncached) better-auth instance per request when a request-scoped DB exists. **Do not** introduce a module-level mutable global cache for the auth instance (Workers isolate reuse → cross-request data bleed).
- `defineServerAuth(({ db, runtimeConfig, requestOrigin }) => ...)` — `ctx.db` is for *your* queries, not for feeding `database`.
- Remote-only migration outside a deploy is **under-documented**; the reliable path to apply to remote D1 is `npx nuxthub deploy`. Set `hub: { db: { ..., applyMigrationsDuringBuild: false } }` to disable auto-apply if manual control is needed.
- **Hand-review every generated migration before deploy** (D1 migrations are not transactional across statements; never let plugin regen auto-drop/rename live columns — debate D1).

### Fallback (open question #2)
If the alpha module blocks a phase, drop to plain Better Auth: a `server/api/auth/[...all].ts` Nitro catch-all mounting `betterAuth({ database: drizzleAdapter(hubDatabase(), { provider: 'sqlite' }), ...plugins })`, and generate schema with `npx @better-auth/cli generate` into a drizzle schema file fed to `nuxt db generate`. More control, more boilerplate, loses the module's composables.

## B. OIDC provider — verified against installed `better-auth@1.6.16` source

- **Discovery doc:** `/<mount>/.well-known/openid-configuration` → real URL `http://localhost:3000/api/auth/.well-known/openid-configuration` (prod: `https://auth.example.com/...`).
- **Endpoints (all under `/api/auth`):** `oauth2/authorize`, `oauth2/token`, `oauth2/userinfo`, `jwks`, `oauth2/register`, `oauth2/endsession`.
- Advertises: `response_types_supported: ["code"]`, `grant_types: ["authorization_code","refresh_token"]`, `token_endpoint_auth_methods: ["client_secret_basic","client_secret_post","none"]`, `code_challenge_methods_supported: ["S256"]`, `scopes: ["openid","profile","email","offline_access"]`.
- **Public SPA clients ARE supported:** `type: "public"` → `token_endpoint_auth_method: "none"`, **must** send PKCE `code_verifier` (token endpoint rejects public clients without one). Confidential clients must send a valid `client_secret`.
- **`trustedClients` field name is `redirectURLs`** (camel, capital URL). Inline config bypasses DB lookup; `skipConsent: true` bypasses the consent screen.

### ⚠ Security-critical OIDC defaults (debate C1–C4, H2) — baked into Phase 1 config
- **C1 — ID tokens default to HS256 signed with the client secret.** JWKS is dead weight unless you set **`oidcProvider({ useJWTPlugin: true })`**. Mandatory.
- **C2 — jwt plugin defaults to EdDSA**, which many RP libs can't verify. Pin **RS256**: `jwt({ jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } } })`. Decide before any client integrates (changing alg rotates keys, breaks live sessions).
- **Issuer mismatch:** metadata `issuer` defaults to `baseURL` (no `/api/auth`) but discovery+endpoints live under `/api/auth`; strict RP libs throw "issuer mismatch". **Fix:** `jwt({ jwt: { issuer: \`${baseURL}/api/auth\` } })`, and point every client's discovery at `${baseURL}/api/auth`.
- **C3 — `storeClientSecret` defaults to `"plain"`** (plaintext secrets in D1). Set a non-plain mode (VERIFY accepted enum, e.g. `"encrypted"`/`"hashed"`).
- **C4 — trustedClients secrets are returned verbatim** → don't inline literal secrets in committed config; load from `runtimeConfig`/Workers secrets. Don't blanket `skipConsent` — reserve for first-party apps you control.
- **H2 — `plain` PKCE is still honored by the token endpoint** even though only `S256` is advertised. Set `requirePKCE: true` AND restrict to S256 (VERIFY option name, likely `allowedCodeChallengeMethods: ["S256"]`).
- **CF1 — JWKS keypair persists in the `jwks` table** by default; ensure it is not regenerated per request (would break verification mid-flight).

### Deprecation
`oidcProvider` emits a deprecation warning in 1.6.16; successor is `@better-auth/oauth-provider` (same endpoints). See open question #1 + Phase-1 spike P1.0.

## C. Demo client recipes (verified libraries, 2026)

| Stack | Port | Library | Auth method | Redirect URI to register |
|---|---|---|---|---|
| Express | 3001 | `openid-client@^6` (+`express-session`) | confidential, `client_secret_basic` | `http://localhost:3001/callback` |
| Next.js | 3002 | `next-auth@5` (Auth.js v5) custom `type:"oidc"` provider | confidential, `client_secret_post` | `http://localhost:3002/api/auth/callback/betterauth` |
| Nuxt | 3003 | `nuxt-oidc-auth` generic `oidc` provider | confidential, PKCE | `http://localhost:3003/auth/oidc/callback` |
| Vue SPA | 3004 | `oauth4webapi@^3` | **public**, `none` + PKCE | `http://localhost:3004/callback` |

Discovery URL for all: `http://localhost:3000/api/auth/.well-known/openid-configuration`. Full per-stack code in `phase-01` (express) and `phase-04` (next/nuxt/vue). The Vue SPA needs its origin in the IdP `trustedOrigins` (cross-origin token/userinfo calls).

## D. `@better-auth/api-key` (debate C5 — must verify path)
The `apiKey` plugin and `enableSessionForAPIKeys` were **NOT found** in the installed core `better-auth@1.6.16` `plugins/index.mjs`. It is the separate package **`@better-auth/api-key`** (`import { apiKey } from "@better-auth/api-key"`). **Phase 3 step P3.0 installs it and confirms the export + the exact option name** before building on it. If absent there, check `better-auth/plugins` for the pinned version.
