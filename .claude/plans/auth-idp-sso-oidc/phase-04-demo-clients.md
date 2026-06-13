# Phase 4 — Remaining demo clients (Next, Nuxt, Vue SPA)

**Goal:** Three more relying-party apps, each a different stack, registered as trusted OIDC clients, proving cross-app SSO. Kept as **thin SSO probes** (login → show user) per YAGNI; Express (P1) is the one fuller reference. Together with Express they simulate `foo`/`bar`/`baz` + a 4th on different origins.

**Depends on:** P1 (OIDC working). **Unblocks:** P5 SSO proof.

## Step P4.0 — Register the 3 clients (IdP `trustedClients`)
Add to `oidcProvider.trustedClients` in `server/auth.config.ts` (secrets from `runtimeConfig`, debate C4):
```ts
{ clientId: 'next-app', clientSecret: runtimeConfig.oidcNextSecret, name: 'Next RP', type: 'web',
  redirectURLs: ['http://localhost:3002/api/auth/callback/betterauth'], skipConsent: true },
{ clientId: 'nuxt-app', clientSecret: runtimeConfig.oidcNuxtSecret, name: 'Nuxt RP', type: 'web',
  redirectURLs: ['http://localhost:3003/auth/oidc/callback'], skipConsent: true },
{ clientId: 'vue-spa', name: 'Vue SPA', type: 'public', // public: NO secret, PKCE-only
  redirectURLs: ['http://localhost:3004/callback'], skipConsent: true },
```
Add `oidcNextSecret`/`oidcNuxtSecret` to `runtimeConfig` + `.env`. Restart dev (config change; no schema change since trustedClients is config). Ensure `http://localhost:3004` is in `trustedOrigins` (P2) — the SPA calls token/userinfo cross-origin.

## Step P4.1 — Next.js (`examples/next/`) — `next-auth@5`
Deps: `next`, `react`, `react-dom`, `next-auth@5`.
`examples/next/auth.ts`:
```ts
import NextAuth from 'next-auth'
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [{
    id: 'betterauth', name: 'Better Auth', type: 'oidc',
    issuer: process.env.OIDC_ISSUER,                 // must equal the IdP jwt.issuer (http://localhost:3000/api/auth)
    wellKnown: `${process.env.OIDC_ISSUER}/.well-known/openid-configuration`,
    clientId: process.env.OIDC_CLIENT_ID, clientSecret: process.env.OIDC_CLIENT_SECRET,
    authorization: { params: { scope: 'openid profile email' } },
    checks: ['pkce', 'state'],
  }],
})
```
`examples/next/app/api/auth/[...nextauth]/route.ts`: `export { GET, POST } from '@/auth'`
`examples/next/app/page.tsx`:
```tsx
import { auth, signIn } from '@/auth'
export default async function Page() {
  const session = await auth()
  if (!session) return <form action={async () => { 'use server'; await signIn('betterauth') }}><button>Sign in</button></form>
  return <pre>{JSON.stringify(session.user, null, 2)}</pre>
}
```
`.env`: `AUTH_SECRET=...`, `OIDC_ISSUER=http://localhost:3000/api/auth`, `OIDC_CLIENT_ID=next-app`, `OIDC_CLIENT_SECRET=<oidcNextSecret>`. Run on :3002 (`next dev -p 3002`).

## Step P4.2 — Nuxt (`examples/nuxt/`) — `nuxt-oidc-auth`
`examples/nuxt/nuxt.config.ts`:
```ts
export default defineNuxtConfig({
  modules: ['nuxt-oidc-auth'],
  oidc: { providers: { oidc: {
    clientId: process.env.OIDC_CLIENT_ID!, clientSecret: process.env.OIDC_CLIENT_SECRET!,
    redirectUri: 'http://localhost:3003/auth/oidc/callback',
    openIdConfiguration: 'http://localhost:3000/api/auth/.well-known/openid-configuration',
    scope: ['openid', 'profile', 'email'], pkce: true, state: true, nonce: true,
  } } },
})
```
`examples/nuxt/app.vue`:
```vue
<script setup>const { loggedIn, user, login } = useOidcAuth()</script>
<template>
  <button v-if="!loggedIn" @click="login('oidc')">Sign in</button>
  <pre v-else>{{ user.userInfo }}</pre>
</template>
```
`.env`: `NUXT_OIDC_SESSION_SECRET=<48+ chars>`, `OIDC_CLIENT_ID=nuxt-app`, `OIDC_CLIENT_SECRET=<oidcNuxtSecret>`. Run on :3003.

## Step P4.3 — Vue SPA (`examples/vue/`) — `oauth4webapi@^3` (public client, PKCE)
`examples/vue/src/auth.ts`:
```ts
import * as oauth from 'oauth4webapi'
const issuer = new URL('http://localhost:3000/api/auth')
const as = await oauth.processDiscoveryResponse(issuer, await oauth.discoveryRequest(issuer))
const client: oauth.Client = { client_id: 'vue-spa' }
const auth: oauth.ClientAuth = oauth.None()
const redirect_uri = 'http://localhost:3004/callback'

export async function login() {
  const code_verifier = oauth.generateRandomCodeVerifier()
  const code_challenge = await oauth.calculatePKCECodeChallenge(code_verifier)
  const state = oauth.generateRandomState()
  sessionStorage.setItem('pkce', code_verifier); sessionStorage.setItem('state', state)
  const url = new URL(as.authorization_endpoint!)
  url.search = new URLSearchParams({
    client_id: client.client_id, redirect_uri, response_type: 'code',
    scope: 'openid profile email', code_challenge, code_challenge_method: 'S256', state,
  }).toString()
  location.href = url.href
}
export async function handleCallback() {
  const params = oauth.validateAuthResponse(as, client, new URL(location.href), sessionStorage.getItem('state')!)
  const res = await oauth.authorizationCodeGrantRequest(as, client, auth, params, redirect_uri, sessionStorage.getItem('pkce')!)
  const tokens = await oauth.processAuthorizationCodeResponse(as, client, res)
  const sub = oauth.getValidatedIdTokenClaims(tokens)!.sub
  return oauth.processUserInfoResponse(as, client, sub, await oauth.userInfoRequest(as, client, tokens.access_token))
}
```
Wire two routes: `/` (button → `login()`), `/callback` (calls `handleCallback()` → render user). Run on :3004 (`vite --port 3004`).

## Step P4.4 (optional) — realistic domains via hosts file
To exercise true different-root-domain behavior locally, map `foo.localtest.me`/`bar.localtest.me`/etc. (or `/etc/hosts` + `C:\Windows\System32\drivers\etc\hosts`) and update redirect URIs + `trustedOrigins`. Default keeps localhost ports (origin isolation already proves independent OIDC sessions).

## Acceptance criteria
- [ ] Each of next (:3002), nuxt (:3003), vue (:3004) completes a login via the IdP and displays the user's profile.
- [ ] **SSO proof:** with an active IdP session (from logging into Express), opening a second client and clicking sign-in completes **without** re-entering credentials.
- [ ] The Vue **public** client works with no client secret (PKCE-only); rejecting it without a `code_verifier` fails (confirms public-client PKCE enforcement).
- [ ] All redirect URIs match the registered `redirectURLs` exactly (no trailing-slash/port drift — debate H1).

## Notes for cook
- All issuers must equal the IdP's `jwt.issuer` (`.../api/auth`) or strict libs throw issuer-mismatch.
- Keep each client minimal — these prove federation, not framework auth depth.
