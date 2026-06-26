# Phase 6 — Playground smoke + module build/link + proofs

**Repos:** `D:\projects\better-auth` (module + IdP)
**Goal:** Prove the module end-to-end against the dev IdP before touching nuxt-template, and produce the built `dist` that nuxt-template will link.

**Depends on:** Phases 1–5.

---

## Step 6.1 — Register a dev OAuth client for the playground

The playground runs on a Nuxt dev port (module default `pnpm dev playground`). Add a demo client to the IdP seed so the OIDC loop has a registered redirect URI + secret.

Edit the IdP seed (`server/tasks/seed/idp.ts`, the `DEMO_CLIENTS` list — see memory [[auth-idp-oidc-decisions]]). Add:

```ts
{ name: 'auth-module-playground', redirectUris: ['http://localhost:3001/auth/callback'], type: 'web', skipConsent: true }
```

(Confirm the playground dev port; set it explicitly in `playground/nuxt.config.ts` via `devServer: { port: 3001 }` so the redirect URI matches.) Re-seed:

```bash
cd D:/projects/better-auth && pnpm dev   # IdP on :3000
curl -X POST http://localhost:3000/_nitro/tasks/seed:idp
# read the generated client_id/secret from examples/.clients.json
```

Also grant the playground client access for a test member so `organizations[]` is non-empty (the seed's authz fixtures already create access rows — verify one targets this client or `*`).

## Step 6.2 — Configure the playground

`packages/auth/playground/nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@thecodeorigin/auth'],
  devtools: { enabled: true },
  compatibilityDate: 'latest',
  devServer: { port: 3001 },
  runtimeConfig: {
    auth: { clientSecret: '' }, // NUXT_AUTH_CLIENT_SECRET from .env
  },
  auth: {
    domain: 'localhost:3000',
    issuer: 'http://localhost:3000/api/auth', // dev override (http)
    clientId: '',                             // NUXT_THECODEORIGIN_CLIENT_ID
    clientSecret: '',                         // NUXT_THECODEORIGIN_CLIENT_SECRET
    routes: { signIn: '/auth/sign-in', callback: '/auth/callback', signOut: '/auth/sign-out', home: '/', error: '/' },
  },
})
```

`packages/auth/playground/.env` (gitignored):

```
NUXT_THECODEORIGIN_CLIENT_ID=<from .clients.json>
NUXT_THECODEORIGIN_CLIENT_SECRET=<from .clients.json>
```

`packages/auth/playground/app.vue` — exercise the full surface:

```vue
<script setup lang="ts">
const { user, loggedIn, abilities, isImpersonating, impersonator, getOrganizations, getImpersonatableUsers, impersonate, stopImpersonating, switchOrganization, signIn, signOut } = useAuth()
const { can } = useCasl()
const candidates = ref<any[]>([])
async function loadCandidates() { candidates.value = (await getImpersonatableUsers()).items }
</script>
<template>
  <div style="padding:2rem;font-family:sans-serif">
    <button v-if="!loggedIn" @click="signIn('/')">Sign in with THECODEORIGIN</button>
    <template v-else>
      <p>{{ user?.email }} — impersonating: {{ isImpersonating }} (by {{ impersonator?.email }})</p>
      <p>abilities: {{ abilities.join(', ') }} | can read project: {{ can('read','project') }}</p>
      <h3>Organizations</h3>
      <ul><li v-for="o in getOrganizations()" :key="o.id"><button @click="switchOrganization(o.id)">{{ o.name }} ({{ o.role }})</button></li></ul>
      <h3>Impersonate</h3>
      <button @click="loadCandidates">Load candidates</button>
      <ul><li v-for="c in candidates" :key="c.id"><button @click="impersonate(c.id)">{{ c.email }}</button></li></ul>
      <button v-if="isImpersonating" @click="stopImpersonating">Stop impersonating</button>
      <button @click="signOut">Sign out</button>
    </template>
  </div>
</template>
```

## Step 6.3 — Build & swap the IdP contract import

```bash
cd D:/projects/better-auth/packages/auth
pnpm prepare           # stub + prepare
pnpm prepack           # build dist (incl. dist/contract)
```

Confirm `dist/contract/index.mjs` + `.d.mts` exist. Then in the IdP, replace the temporary `shared/auth-contract.ts` import (Phase 1) with the module's:

```ts
import { type RpOrganization, UserinfoClaimsSchema } from '@thecodeorigin/auth/contract'
```

Add `@thecodeorigin/auth` as a workspace dep of the IdP root (`"@thecodeorigin/auth": "workspace:*"`) so the import resolves (the package is already in `packages/` and `pnpm-workspace.yaml`). Delete `shared/auth-contract.ts`. Re-run IdP `pnpm exec nuxi typecheck`.

## Step 6.4 — Run the proofs

```bash
# IdP on :3000 (running), then:
cd D:/projects/better-auth && node examples/rp-proof.mjs      # Phase 2 assertions
cd packages/auth && pnpm dev                                  # playground on :3001
```

Browser walk (Chrome DevTools MCP) on `http://localhost:3001`:
1. Sign in → returns authenticated; `user.email` shown.
2. DevTools → Application → Cookies: the `tco_auth` cookie value is an opaque hex id; **no** `access_token`/`refresh_token` anywhere client-side.
3. `getOrganizations()` shows the granted org(s); switch changes `can(...)`.
4. As an admin test user: load candidates (no admins listed), impersonate a member → banner data flips, `isImpersonating` true → stop restores admin.
5. Sign out → cookie cleared, back to signed-out.

```bash
pnpm --filter @thecodeorigin/auth lint
pnpm --filter @thecodeorigin/auth test:types
cd D:/projects/better-auth && pnpm lint && pnpm exec nuxi typecheck
```

## Acceptance
- [ ] Full OIDC + orgs + impersonation loop works in the playground against the dev IdP.
- [ ] No tokens client-side; opaque cookie only.
- [ ] `dist/` (incl. `/contract`) built; IdP imports the contract from the module; both typecheck clean.
- [ ] `rp-proof.mjs`, `sso-proof.mjs`, `authz-proof.mjs` green.
