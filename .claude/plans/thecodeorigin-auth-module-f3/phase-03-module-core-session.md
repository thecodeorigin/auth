# Phase 3 — Module core: config, OIDC flow, server-side session

**Repo:** `D:\projects\better-auth\packages\auth`
**Goal:** Turn the scaffold into a working OIDC RP: typed config, PKCE sign-in redirect, callback that mints a server-side session, sign-out that revokes, and a local `GET /api/_auth/session` reader (no IdP call on the hot path).

**Depends on:** Phase 1 (contract).

---

## Step 3.0 — Package deps & exports

Edit `packages/auth/package.json`:
- Add runtime deps: `"defu"`, `"ufo"`, `"h3"`, `"zod"`, `"ofetch"` (all `catalog:` if present, else pin to the versions used in the IdP root). `@nuxt/kit` is already there.
- Add a **contract** subpath export so the IdP and consumers can import pure Zod schemas without Nuxt:

```jsonc
"exports": {
  ".": { "types": "./dist/types.d.mts", "import": "./dist/module.mjs" },
  "./contract": { "types": "./dist/contract/index.d.mts", "import": "./dist/contract/index.mjs" }
}
```

> `nuxt-module-build` bundles `src/runtime` + `src/module`. To also emit `dist/contract`, add a `build.config.ts` entry (unbuild) or keep `contract` importable from source via `tsconfig` paths; simplest: add `"./contract": "./src/contract/index.ts"` for dev and let `nuxt-module-build` copy it. Verify `dist/contract/index.mjs` exists after `pnpm prepack`; if not, add an explicit `build.config.ts` with `entries: ['src/module', { input: 'src/contract/', outDir: 'dist/contract' }]`.

## Step 3.1 — `src/contract/index.ts`

Move the contract here (canonical home). Copy `UserinfoClaimsSchema`/`RpOrganizationSchema` from Phase 1 §1.1, and add:

```ts
import { z } from 'zod'
// ... RpOrganizationSchema, UserinfoClaimsSchema (from Phase 1) ...

export const PublicUserSchema = z.object({
  sub: z.string(), email: z.string(), name: z.string().nullable(), picture: z.string().nullable(),
})
export type PublicUser = z.infer<typeof PublicUserSchema>

export const ImpersonationCandidateSchema = z.object({
  id: z.string(), email: z.string(), name: z.string().nullable(), image: z.string().nullable(),
})
export type ImpersonationCandidate = z.infer<typeof ImpersonationCandidateSchema>

/** What the browser is allowed to see (NO tokens). */
export const PublicSessionSchema = z.object({
  user: PublicUserSchema,
  abilities: z.array(z.string()),
  systemRole: z.string().nullable(),
  organizations: z.array(RpOrganizationSchema),
  activeOrg: z.string().nullable(),
  entitlement: UserinfoClaimsSchema.shape.entitlement,
  impersonator: PublicUserSchema.nullable(),
})
export type PublicSession = z.infer<typeof PublicSessionSchema>
```

Then in Phase 1, swap `shared/auth-contract.ts` for `import ... from '@thecodeorigin/auth/contract'` in the IdP (done in Phase 6 once the module is built/linked).

## Step 3.2 — `src/module.ts` (rewrite)

```ts
import { addImportsDir, addPlugin, addRouteMiddleware, addServerHandler, addServerImportsDir, createResolver, defineNuxtModule } from '@nuxt/kit'
import { defu } from 'defu'

export interface AuthRoutes { signIn: string, callback: string, signOut: string, home: string, error: string }
export interface ModuleOptions {
  domain: string
  clientId: string
  clientSecret: string
  issuer?: string              // override; default https://{domain}/api/auth
  scopes?: string[]            // default ['openid','profile','email']
  sessionStorageBase?: string  // Nitro useStorage base; default 'auth'
  sessionCookieName?: string   // default 'tco_auth'
  routes?: Partial<AuthRoutes>
}

export default defineNuxtModule<ModuleOptions>({
  meta: { name: '@thecodeorigin/auth', configKey: 'auth' },
  defaults: {
    domain: '', clientId: '', clientSecret: '',
    scopes: ['openid', 'profile', 'email'],
    sessionStorageBase: 'auth', sessionCookieName: 'tco_auth',
    routes: { signIn: '/auth/sign-in', callback: '/auth/callback', signOut: '/auth/sign-out', home: '/', error: '/auth/sign-in' },
  },
  setup(options, nuxt) {
    const resolver = createResolver(import.meta.url)
    const routes = options.routes as AuthRoutes
    const issuer = options.issuer || `https://${options.domain}/api/auth`

    // runtimeConfig: secret server-only; the rest public for redirects/middleware.
    nuxt.options.runtimeConfig.auth = defu(nuxt.options.runtimeConfig.auth as any, {
      clientSecret: options.clientSecret,        // NUXT_AUTH_CLIENT_SECRET
      sessionStorageBase: options.sessionStorageBase,
      sessionCookieName: options.sessionCookieName,
    })
    nuxt.options.runtimeConfig.public.auth = defu(nuxt.options.runtimeConfig.public.auth as any, {
      domain: options.domain, clientId: options.clientId, issuer, scopes: options.scopes, routes,
    })

    // Map the user's env (NUXT_THECODEORIGIN_*) onto our keys if not explicitly set.
    // (Nuxt auto-binds NUXT_AUTH_* to runtimeConfig.auth.*; also accept NUXT_THECODEORIGIN_*.)
    // Done in runtime via resolveConfig() reading both — see utils/oidc.ts.

    // #auth virtual alias → composables
    nuxt.options.alias['#auth'] = resolver.resolve('./runtime/app/composables/useAuth')

    // OIDC flow server routes (configurable paths)
    addServerHandler({ route: routes.signIn, handler: resolver.resolve('./runtime/server/routes/sign-in.get') })
    addServerHandler({ route: routes.callback, handler: resolver.resolve('./runtime/server/routes/callback.get') })
    addServerHandler({ route: routes.signOut, handler: resolver.resolve('./runtime/server/routes/sign-out.get') })

    // _auth API (fixed paths)
    for (const [route, file] of [
      ['/api/_auth/session', 'session.get'],
      ['/api/_auth/organizations', 'organizations.get'],
      ['/api/_auth/organizations/switch', 'organizations/switch.post'],
      ['/api/_auth/impersonatable-users', 'impersonatable-users.get'],
      ['/api/_auth/impersonate', 'impersonate.post'],
      ['/api/_auth/stop-impersonating', 'stop-impersonating.post'],
    ] as const)
      addServerHandler({ route, handler: resolver.resolve(`./runtime/server/api/_auth/${file}`) })

    addServerImportsDir(resolver.resolve('./runtime/server/utils'))
    addImportsDir(resolver.resolve('./runtime/app/composables'))
    addRouteMiddleware({ name: 'auth', path: resolver.resolve('./runtime/app/middleware/auth.global'), global: true })
    addRouteMiddleware({ name: 'casl', path: resolver.resolve('./runtime/app/middleware/casl.global'), global: true })
    addPlugin(resolver.resolve('./runtime/app/plugins/0.session'))
    addPlugin(resolver.resolve('./runtime/app/plugins/ability'))

    // PageMeta augmentation (public / unauthenticatedOnly / can)
    nuxt.hook('prepare:types', ({ references }) => {
      references.push({ path: resolver.resolve('./runtime/types.d.ts') })
    })
  },
})
```

`src/runtime/types.d.ts`:

```ts
declare module '#app' {
  interface PageMeta { public?: boolean, unauthenticatedOnly?: boolean, can?: string[] }
}
declare module 'vue-router' {
  interface RouteMeta { public?: boolean, unauthenticatedOnly?: boolean, can?: string[] }
}
export {}
```

## Step 3.3 — `src/runtime/server/utils/oidc.ts`

```ts
import type { H3Event } from 'h3'

export interface ResolvedAuthConfig { issuer: string, clientId: string, clientSecret: string, scopes: string[], routes: { signIn: string, callback: string, signOut: string, home: string, error: string }, cookieName: string, storageBase: string }

export function resolveAuthConfig(): ResolvedAuthConfig {
  const rc = useRuntimeConfig()
  const pub = (rc.public as any).auth
  const priv = (rc as any).auth
  // Accept NUXT_THECODEORIGIN_* as fallbacks for domain/clientId/clientSecret.
  const domain = pub.domain || process.env.NUXT_THECODEORIGIN_DOMAIN || ''
  return {
    issuer: pub.issuer || (domain ? `https://${domain}/api/auth` : ''),
    clientId: pub.clientId || process.env.NUXT_THECODEORIGIN_CLIENT_ID || '',
    clientSecret: priv.clientSecret || process.env.NUXT_THECODEORIGIN_CLIENT_SECRET || '',
    scopes: pub.scopes ?? ['openid', 'profile', 'email'],
    routes: pub.routes,
    cookieName: priv.sessionCookieName || 'tco_auth',
    storageBase: priv.sessionStorageBase || 'auth',
  }
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
export function randomString(len = 64): string {
  const a = new Uint8Array(len); crypto.getRandomValues(a)
  return b64url(a.buffer).slice(0, len)
}
export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
}
export function callbackRedirectUri(event: H3Event, cfg: ResolvedAuthConfig): string {
  const proto = getRequestProtocol(event); const host = getRequestHost(event)
  return `${proto}://${host}${cfg.routes.callback}`
}
export async function exchangeCode(cfg: ResolvedAuthConfig, code: string, verifier: string, redirectUri: string) {
  return $fetch<{ access_token: string, refresh_token?: string, expires_in?: number, id_token?: string }>(`${cfg.issuer}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}` },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier }).toString(),
  })
}
export async function fetchUserinfo(cfg: ResolvedAuthConfig, accessToken: string) {
  return $fetch(`${cfg.issuer}/oauth2/userinfo`, { headers: { Authorization: `Bearer ${accessToken}` } })
}
/** Same-origin, path-only redirect target (FM H4). */
export function safePath(target: string | undefined, fallback: string): string {
  if (!target || !target.startsWith('/') || target.startsWith('//'))
    return fallback
  return target
}
```

> `getRequestProtocol`/`getRequestHost`/`$fetch` are auto-imported in Nitro. In dev the IdP is `http://localhost:3000`; set `issuer` via `NUXT_THECODEORIGIN_ISSUER`/config `issuer` (e.g. `http://localhost:3000/api/auth`) — the `https://{domain}` default is for prod.

## Step 3.4 — `src/runtime/server/utils/session.ts`

```ts
import type { H3Event } from 'h3'
import type { PublicSession } from '../../../contract'
import { resolveAuthConfig } from './oidc'

export interface SessionRecord {
  sub: string
  user: { sub: string, email: string, name: string | null, picture: string | null }
  abilities: string[]
  systemRole: string | null
  organizations: PublicSession['organizations']
  activeOrg: string | null
  entitlement: PublicSession['entitlement']
  accessToken: string
  refreshToken: string | null
  accessExpiresAt: number
  isImpersonation: boolean
  impersonator: { sub: string, email: string, name: string | null, picture: string | null } | null
  backupId: string | null    // record id of the admin's pre-impersonation session
}

const ID_COOKIE = (cfg = resolveAuthConfig()) => cfg.cookieName
function store(base: string) { return useStorage(base) }
function key(id: string) { return `session:${id}` }

export function newSessionId(): string { const a = new Uint8Array(32); crypto.getRandomValues(a); return [...a].map(b => b.toString(16).padStart(2, '0')).join('') }

export async function writeSessionRecord(id: string, rec: SessionRecord): Promise<void> {
  const cfg = resolveAuthConfig(); await store(cfg.storageBase).setItem(key(id), rec)
}
export async function readSessionRecord(event: H3Event): Promise<{ id: string, rec: SessionRecord } | null> {
  const cfg = resolveAuthConfig()
  const id = getCookie(event, cfg.cookieName)
  if (!id) return null
  const rec = await store(cfg.storageBase).getItem<SessionRecord>(key(id))
  return rec ? { id, rec } : null
}
export async function setSessionCookie(event: H3Event, id: string): Promise<void> {
  const cfg = resolveAuthConfig()
  setCookie(event, cfg.cookieName, id, { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 7 })
}
export async function destroySession(event: H3Event): Promise<SessionRecord | null> {
  const cfg = resolveAuthConfig()
  const id = getCookie(event, cfg.cookieName)
  if (!id) return null
  const rec = await store(cfg.storageBase).getItem<SessionRecord>(key(id))
  await store(cfg.storageBase).removeItem(key(id))
  deleteCookie(event, cfg.cookieName, { path: '/' })
  return rec
}
/** Browser-safe projection (NO tokens) — FM C4. */
export function toPublicSession(rec: SessionRecord): PublicSession {
  return { user: rec.user, abilities: rec.abilities, systemRole: rec.systemRole, organizations: rec.organizations, activeOrg: rec.activeOrg, entitlement: rec.entitlement, impersonator: rec.impersonator }
}
```

> `useStorage` is Nitro's auto-imported storage. On NuxtHub/Cloudflare, mount KV in the consumer's `nuxt.config` (`nitro.storage` or NuxtHub auto-KV); in dev it's memory. Document in README (Open Q4).

## Step 3.5 — Flow routes

`src/runtime/server/routes/sign-in.get.ts`:

```ts
import { callbackRedirectUri, pkceChallenge, randomString, resolveAuthConfig, safePath } from '../utils/oidc'
import { withQuery } from 'ufo'

export default defineEventHandler(async (event) => {
  const cfg = resolveAuthConfig()
  if (!cfg.issuer || !cfg.clientId || !cfg.clientSecret)
    throw createError({ statusCode: 503, statusMessage: 'Auth not configured' })
  const state = randomString(32)
  const verifier = randomString(64)
  const redirectTo = safePath(getQuery(event).redirect as string | undefined, cfg.routes.home)
  const opts = { httpOnly: true, secure: !import.meta.dev, sameSite: 'lax' as const, maxAge: 600, path: cfg.routes.callback }
  setCookie(event, 'tco_state', state, opts)
  setCookie(event, 'tco_verifier', verifier, opts)
  setCookie(event, 'tco_redirect', redirectTo, opts)
  return sendRedirect(event, withQuery(`${cfg.issuer}/oauth2/authorize`, {
    client_id: cfg.clientId, redirect_uri: callbackRedirectUri(event, cfg), response_type: 'code',
    scope: cfg.scopes.join(' '), state, code_challenge: await pkceChallenge(verifier), code_challenge_method: 'S256',
  }))
})
```

`src/runtime/server/routes/callback.get.ts`:

```ts
import { UserinfoClaimsSchema } from '../../../contract'
import { callbackRedirectUri, exchangeCode, fetchUserinfo, resolveAuthConfig, safePath } from '../utils/oidc'
import { newSessionId, setSessionCookie, writeSessionRecord } from '../utils/session'

export default defineEventHandler(async (event) => {
  const cfg = resolveAuthConfig()
  const q = getQuery(event)
  const fail = (e: string) => sendRedirect(event, `${cfg.routes.error}?error=${encodeURIComponent(e)}`)
  if (q.error) return fail(String(q.error))                       // FM H6: terminal on ?error

  const state = getCookie(event, 'tco_state')
  const verifier = getCookie(event, 'tco_verifier')
  const redirectTo = safePath(getCookie(event, 'tco_redirect'), cfg.routes.home)
  for (const c of ['tco_state', 'tco_verifier', 'tco_redirect']) deleteCookie(event, c, { path: cfg.routes.callback })
  if (!q.code || !q.state || !state || q.state !== state || !verifier) return fail('invalid_state')

  let tokens, userinfoRaw
  try {
    tokens = await exchangeCode(cfg, String(q.code), verifier, callbackRedirectUri(event, cfg))
    userinfoRaw = await fetchUserinfo(cfg, tokens.access_token)
  } catch { return fail('token_exchange_failed') }

  const claims = UserinfoClaimsSchema.extend({ sub: (await import('zod')).z.string(), email: (await import('zod')).z.string().optional(), email_verified: (await import('zod')).z.union([(await import('zod')).z.boolean(), (await import('zod')).z.string()]).optional(), name: (await import('zod')).z.string().optional(), picture: (await import('zod')).z.string().optional() }).safeParse(userinfoRaw)
  if (!claims.success) return fail('userinfo_invalid')
  const u = claims.data
  const verified = u.email_verified === true || u.email_verified === 'true'
  if (!u.sub || !u.email || !verified) return fail('email_unverified') // FM H7

  const id = newSessionId()
  await writeSessionRecord(id, {
    sub: u.sub,
    user: { sub: u.sub, email: u.email, name: u.name ?? null, picture: u.picture ?? null },
    abilities: u.abilities, systemRole: u.role, organizations: u.organizations,
    activeOrg: u.org, entitlement: u.entitlement,
    accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null,
    accessExpiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
    isImpersonation: false, impersonator: null, backupId: null,
  })
  await setSessionCookie(event, id)
  return sendRedirect(event, redirectTo)
})
```

> The inline `import('zod')` is ugly; instead `import { z } from 'zod'` at top and build the extended schema once. Shown inline only to convey intent — cook: hoist it.

`src/runtime/server/routes/sign-out.get.ts`:

```ts
import { resolveAuthConfig } from '../utils/oidc'
import { destroySession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const cfg = resolveAuthConfig()
  const rec = await destroySession(event)         // delete KV record + clear cookie
  if (rec?.accessToken) {                          // FM H3: best-effort IdP revoke
    try { await $fetch(`${cfg.issuer}/oauth2/endsession`, { method: 'POST', body: new URLSearchParams({ token: rec.refreshToken ?? rec.accessToken }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }) } catch {}
  }
  return sendRedirect(event, cfg.routes.home)
})
```

> Confirm the IdP's end-session/revoke endpoint name (`/oauth2/endsession` per the Phase-0 explore). If it requires GET or different params, adjust; failure is non-fatal.

## Step 3.6 — `GET /api/_auth/session` (hot path, local only)

`src/runtime/server/api/_auth/session.get.ts`:

```ts
import { readSessionRecord, toPublicSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)         // FM M2: KV only, no IdP call
  return s ? toPublicSession(s.rec) : null
})
```

---

## Verification
- `pnpm --filter @thecodeorigin/auth prepare && pnpm --filter @thecodeorigin/auth test:types` → 0.
- Manual: with a dev IdP client registered for the playground (Phase 6), hit `{signIn}` → IdP login → `{callback}` → cookie set, `GET /api/_auth/session` returns the public session, no token fields present.

## Acceptance
- [ ] PKCE S256 flow completes; session record stored server-side; cookie is opaque id only.
- [ ] `/api/_auth/session` returns tokenless public session and makes no IdP call.
- [ ] `?error=`, bad state, missing verifier, unverified email all redirect to `{error}` (no 500).
