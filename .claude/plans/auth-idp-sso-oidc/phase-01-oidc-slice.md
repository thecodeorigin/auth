# Phase 1 — OIDC vertical slice + Cloudflare smoke-deploy

**Goal (de-risk):** Prove the two hardest things end-to-end before any polish: (1) the OIDC Authorization-Code+PKCE loop works with RS256 ID tokens and a real JWKS; (2) it runs on Cloudflare Workers. One client (Express) logs in through the IdP both locally and against a deployed Worker.

**Depends on:** P0. **Unblocks:** P2-P6.

## Steps

### P1.0 — SPIKE: evaluate `@better-auth/oauth-provider` (Open Q#1)
```bash
pnpm add @better-auth/oauth-provider   # may not exist / may be pre-release
```
- Inspect its exported plugin options vs the `oidcProvider` config below (`useJWTPlugin`, `trustedClients`/`redirectURLs`, `requirePKCE`, `storeClientSecret`, `consentPage`, `getAdditionalUserInfoClaim`).
- **Decision rule:** if options map cleanly (same names or trivial renames) and discovery works → use it everywhere `oidcProvider` appears in this plan. Otherwise uninstall and proceed with `oidcProvider` (pin `better-auth` version in `package.json`). Record the decision in a comment at the top of `server/auth.config.ts`.

### P1.1 — Add jwt + oidcProvider to `server/auth.config.ts`
Security defaults (debate C1-C4, H2, CF1) are intentional — do not omit:
```ts
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'
import { jwt, oidcProvider } from 'better-auth/plugins'

export default defineServerAuth(({ runtimeConfig }) => {
  const baseURL = runtimeConfig.public.siteUrl || 'http://localhost:3000'
  return {
    emailAndPassword: { enabled: true }, // verification added in P2

    plugins: [
      // C2 + issuer-mismatch fix: RS256 (broad RP support) + issuer aligned to the /api/auth mount.
      jwt({
        jwks: { keyPairConfig: { alg: 'RS256', modulusLength: 2048 } },
        jwt: { issuer: `${baseURL}/api/auth` },
      }),
      oidcProvider({
        loginPage: '/sign-in',
        consentPage: '/oauth/consent',
        useJWTPlugin: true,           // C1: sign ID tokens with RS256 from the jwt plugin, not HS256
        requirePKCE: true,            // H2
        allowedCodeChallengeMethods: ['S256'], // H2 — VERIFY option name against installed version
        storeClientSecret: 'encrypted',        // C3 — VERIFY accepted enum value
        // C4: secrets come from runtimeConfig, never literals committed to the repo.
        trustedClients: [
          {
            clientId: 'express-app',
            clientSecret: runtimeConfig.oidcExpressSecret, // set in .env as NUXT_OIDC_EXPRESS_SECRET
            name: 'Express RP',
            type: 'web',
            redirectURLs: ['http://localhost:3001/callback'],
            skipConsent: true, // first-party demo client only
            disabled: false,
          },
        ],
        // Q5: carry coarse authz claims so apps enforce locally (roles/org added in P3).
        getAdditionalUserInfoClaim: async (_user, _scopes) => ({}),
      }),
    ],
  }
})
```
Add to `nuxt.config.ts` `runtimeConfig` (server-only, top level):
```ts
runtimeConfig: {
  oidcExpressSecret: '', // NUXT_OIDC_EXPRESS_SECRET
  public: { siteUrl: '' },
},
```
Add to `.env`:
```
NUXT_OIDC_EXPRESS_SECRET=<openssl rand -base64 24>
```

### P1.2 — Regenerate schema (RESTART REQUIRED)
```bash
# stop dev, restart so the module regenerates schema for jwt + oidc tables
npx nuxt dev
npx nuxt db generate     # new migration: jwks, oauthApplication, oauthAccessToken, oauthConsent (names per version)
```
Commit the new migration. **Hand-review** the SQL — confirm it only ADDs tables (no drops on P0 tables).

### P1.3 — Minimal sign-in + consent pages
`app/pages/sign-in.vue` (enough to authenticate during the OIDC redirect):
```vue
<script setup lang="ts">
const email = ref(''); const password = ref(''); const error = ref('')
const { signIn } = useAuth() // module composable; adjust to the module's actual client API
async function submit() {
  const { error: e } = await signIn.email({ email: email.value, password: password.value })
  if (e) { error.value = e.message ?? 'Sign-in failed'; return }
  // return to the OIDC authorize flow if present
  const redirect = useRoute().query.redirect as string | undefined
  await navigateTo(redirect || '/')
}
</script>
<template>
  <form @submit.prevent="submit" class="mx-auto mt-24 max-w-sm space-y-3">
    <h1 class="text-xl font-semibold">Sign in</h1>
    <input v-model="email" type="email" placeholder="Email" class="w-full border p-2 rounded" />
    <input v-model="password" type="password" placeholder="Password" class="w-full border p-2 rounded" />
    <button class="w-full bg-black text-white p-2 rounded">Continue</button>
    <p v-if="error" class="text-red-600 text-sm">{{ error }}</p>
  </form>
</template>
```
`app/pages/oauth/consent.vue` (minimal; trusted clients skip it, but non-trusted hit it):
```vue
<script setup lang="ts">
const route = useRoute()
const { oauth2 } = useAuth()
async function decide(accept: boolean) {
  await oauth2.consent({ accept, consent_code: route.query.consent_code as string })
}
</script>
<template>
  <div class="mx-auto mt-24 max-w-sm space-y-3">
    <h1 class="text-xl font-semibold">Authorize {{ route.query.client_id }}</h1>
    <p class="text-sm text-gray-600">Scopes: {{ route.query.scope }}</p>
    <div class="flex gap-2">
      <button @click="decide(true)" class="bg-black text-white p-2 rounded flex-1">Allow</button>
      <button @click="decide(false)" class="border p-2 rounded flex-1">Deny</button>
    </div>
  </div>
</template>
```
> The exact client method names (`useAuth`, `signIn.email`, `oauth2.consent`) depend on `@onmax/nuxt-better-auth`'s client surface — cook verifies against the module and adjusts. The flow shape is fixed.

### P1.4 — Express reference client (`examples/express/`)
`examples/express/package.json`: deps `express`, `express-session`, `openid-client@^6`, `tsx`. Scripts: `"dev": "tsx watch src/index.ts"`.
`examples/express/src/auth.ts`:
```ts
import * as client from 'openid-client'

export const config = await client.discovery(
  new URL(process.env.OIDC_ISSUER!),     // http://localhost:3000/api/auth
  process.env.OIDC_CLIENT_ID!,           // express-app
  process.env.OIDC_CLIENT_SECRET!,       // NUXT_OIDC_EXPRESS_SECRET value
)
export const redirect_uri = 'http://localhost:3001/callback'
```
`examples/express/src/index.ts`:
```ts
import express from 'express'
import session from 'express-session'
import * as client from 'openid-client'
import { config, redirect_uri } from './auth'

const app = express()
app.use(session({ secret: 'dev', resave: false, saveUninitialized: false }))

app.get('/login', async (req, res) => {
  const code_verifier = client.randomPKCECodeVerifier()
  const code_challenge = await client.calculatePKCECodeChallenge(code_verifier)
  const state = client.randomState()
  ;(req.session as any).verifier = code_verifier
  ;(req.session as any).state = state
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri, scope: 'openid profile email', code_challenge, code_challenge_method: 'S256', state,
  })
  res.redirect(url.href)
})

app.get('/callback', async (req, res) => {
  const tokens = await client.authorizationCodeGrant(
    config, new URL(req.originalUrl, 'http://localhost:3001'),
    { pkceCodeVerifier: (req.session as any).verifier, expectedState: (req.session as any).state },
  )
  const claims = tokens.claims()!
  const userinfo = await client.fetchUserInfo(config, tokens.access_token, claims.sub)
  ;(req.session as any).user = userinfo
  res.redirect('/')
})

app.get('/', (req, res) => {
  const u = (req.session as any).user
  res.send(u ? `<pre>${JSON.stringify(u, null, 2)}</pre><a href="/login">re-login</a>`
             : '<a href="/login">Sign in with auth.example.com</a>')
})

app.listen(3001, () => console.log('express RP on http://localhost:3001'))
```
`examples/express/.env`:
```
OIDC_ISSUER=http://localhost:3000/api/auth
OIDC_CLIENT_ID=express-app
OIDC_CLIENT_SECRET=<same as NUXT_OIDC_EXPRESS_SECRET>
```

### P1.5 — Verify locally
1. `npx nuxt dev` (IdP, :3000) + `pnpm --dir examples/express dev` (:3001).
2. Create a test user (sign-up via `/api/auth/sign-up/email` or a temp form).
3. Visit `http://localhost:3001` → Sign in → redirected to IdP `/sign-in` → authenticate → redirected back → Express shows userinfo JSON.

### P1.6 — First Cloudflare smoke-deploy (de-risk Workers)
```bash
npx nuxthub deploy        # links/creates a NuxtHub project, provisions D1, applies migrations remotely
```
Set the deployed Worker's secrets (NuxtHub dashboard or `wrangler secret put`): `NUXT_BETTER_AUTH_SECRET`, `NUXT_PUBLIC_SITE_URL=https://<worker-url>`, `NUXT_OIDC_EXPRESS_SECRET`. Re-point a local Express `.env` `OIDC_ISSUER` at `https://<worker-url>/api/auth` and confirm discovery + one login loop against prod.

## Acceptance criteria
- [ ] `GET http://localhost:3000/api/auth/.well-known/openid-configuration` returns valid JSON with `id_token_signing_alg_values_supported` including `RS256` and a `jwks_uri`.
- [ ] `GET /api/auth/jwks` returns a key set with an RSA key.
- [ ] Express (:3001) completes login; the decoded `id_token` header is `RS256` with a `kid` present in JWKS (assert this explicitly — proves C1/C2 fixed).
- [ ] `npx nuxthub deploy` succeeds; the deployed Worker serves the discovery doc; one OIDC login loop works against the deployed URL.

## Notes for cook
- If the `id_token` is HS256 → `useJWTPlugin` not applied; do not proceed.
- "issuer mismatch" error in `openid-client` → the `jwt.issuer` / `siteUrl` is wrong; both must equal the discovery origin (`.../api/auth`).
- Verify `allowedCodeChallengeMethods` / `storeClientSecret` enum names against the installed version; if an option is rejected, check the plugin's TS types in `node_modules` and adjust (record in findings).
