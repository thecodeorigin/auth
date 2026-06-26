# Getting Started

This guide turns any **Nuxt 4** application into a relying party (RP) of the
THECODEORIGIN identity provider using the **`@thecodeorigin/auth`** module. When
you're done, your users sign in through the central IdP, your app holds a
server-side session (no tokens in the browser), and you have `useAuth()` and a
CASL `$ability` available everywhere.

> **What this module is.** `@thecodeorigin/auth` is a *client* module — an OIDC
> relying party. It does **not** run an identity provider. It talks to the
> hosted IdP at your `domain` (for example `id.thecodeorigin.com`). To register
> the OAuth client your app will use, see
> [Register an application](#step-1-register-an-application).

## Prerequisites

- A Nuxt **4** app (SSR).
- **pnpm** (the platform standardizes on it, but any package manager works for a
  consumer app).
- Access to the management console (or an admin API key) to register an OAuth
  client.
- A server-side **session storage** mount. In dev this is automatic; in
  production you bind a KV namespace (see [Production](#production-session-storage)).

## Step 1: Register an application

Your app needs a `clientId` and (for confidential/server apps) a `clientSecret`.
Create them once in the management console under **Applications**, or via the
[Management REST API](/rest-api#applications-oauth-clients):

```bash
curl -X POST https://id.thecodeorigin.com/api/auth/oauth2/clients \
  -H "x-api-key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Dashboard",
    "redirectUris": ["https://app.example.com/auth/callback"],
    "type": "web"
  }'
```

The response returns the `clientSecret` **exactly once** — store it immediately:

```json
{ "clientId": "oc_…", "clientSecret": "…", "name": "My Dashboard", "public": false }
```

The **redirect URI** must exactly match the callback route in your app —
`https://<your-app>/auth/callback` by default. Only `http(s)://` URIs are
accepted.

## Step 2: Install the module

```bash
pnpm add @thecodeorigin/auth
# or: npx nuxi module add @thecodeorigin/auth
```

Add it to `nuxt.config.ts` and point it at your IdP:

```ts
export default defineNuxtConfig({
  modules: ['@thecodeorigin/auth'],

  auth: {
    // The IdP host — no protocol, no trailing path. The module calls
    // https://<domain>/api/auth/oauth2/authorize under the hood.
    domain: 'id.thecodeorigin.com',

    // Scopes requested at sign-in (defaults shown).
    scopes: ['openid', 'profile', 'email'],

    // Optional — override the routes the module mounts (defaults shown).
    routes: {
      signIn: '/auth/sign-in',
      callback: '/auth/callback',
      signOut: '/auth/sign-out',
      home: '/',
      error: '/auth/sign-in',
    },
  },
})
```

See [Module options](/api#module-options) for the full list (cookie name,
session storage base, etc.).

## Step 3: Provide the client credentials

`clientId` and `clientSecret` are **runtime config**, not committed to source.
Set them via environment variables (Nuxt maps these automatically):

```bash
# .env
NUXT_PUBLIC_AUTH_CLIENT_ID=oc_…      # → runtimeConfig.public.auth.clientId
NUXT_AUTH_CLIENT_SECRET=…            # → runtimeConfig.auth.clientSecret (server-only)
```

| Variable | Maps to | Exposure |
| --- | --- | --- |
| `NUXT_PUBLIC_AUTH_CLIENT_ID` | `public.auth.clientId` | Public |
| `NUXT_AUTH_CLIENT_SECRET` | `auth.clientSecret` | Server-only |
| `NUXT_PUBLIC_AUTH_DOMAIN` | `public.auth.domain` | Public (overrides `auth.domain`) |

> The sign-in route returns **503 "Auth not configured"** until `domain`,
> `clientId`, and `clientSecret` are all present. This is a guard, not a bug.

## Step 4: Add a sign-in button

The module is **secure by default**: a global middleware redirects any
unauthenticated visit to the sign-in flow. Mark public pages explicitly with
`definePageMeta({ public: true })`.

```vue
<script setup lang="ts">
const { user, loggedIn, signIn, signOut } = useAuth()
</script>

<template>
  <div>
    <button v-if="!loggedIn" @click="signIn('/')">
      Sign in with THECODEORIGIN
    </button>
    <template v-else>
      <p>Signed in as {{ user?.email }}</p>
      <button @click="signOut">
        Sign out
      </button>
    </template>
  </div>
</template>
```

That's it. `signIn()` sends the browser to the IdP, the user authenticates, and
the module's `/auth/callback` route exchanges the code, writes a server-side
session, and drops a session cookie. `useAuth()` then reflects the live session.

## What just happened (the flow)

```
Browser            Your Nuxt app (RP)                 IdP (id.thecodeorigin.com)
   │  signIn()         │                                     │
   ├──────────────────▶│  GET /auth/sign-in                  │
   │                   │  set PKCE + state cookies           │
   │◀──────────────────┤  302 → /api/auth/oauth2/authorize ─▶│
   │                                                         │  login + consent
   │◀────────────────────────── 302 → /auth/callback?code ───┤
   ├──────────────────▶│  GET /auth/callback                 │
   │                   │  exchange code (PKCE) ─────────────▶│  /oauth2/token
   │                   │  fetch claims ────────────────────▶│  /oauth2/userinfo
   │                   │  write session record + cookie      │
   │◀──────────────────┤  302 → home                         │
```

- **PKCE (S256)** is always used; `state` is validated on return.
- The IdP's `userinfo` response carries org/role **claims, entitlements, and
  CASL abilities** — see [Concepts](/concepts).
- **No tokens reach the browser.** Access/refresh tokens live only in the
  server-side session record; the browser holds an opaque session-id cookie
  (`tco_auth` by default).

## Step 5: Protect pages and actions

Sign-in is enforced globally. To require an **ability** for a page, declare it —
a second global middleware redirects to `/403` if the user lacks it:

```vue
<script setup lang="ts">
definePageMeta({ can: ['project:view'] }) // subject:action
</script>
```

Mark unauthenticated-only or public pages:

```ts
definePageMeta({ public: true }) // visible signed-out
definePageMeta({ unauthenticatedOnly: true }) // e.g. a marketing page; redirects if signed in
```

Check abilities imperatively with `useCasl()`:

```vue
<script setup lang="ts">
const { can } = useCasl()
</script>

<template>
  <UButton v-if="can('create', 'project')">
    New project
  </UButton>
</template>
```

On the **server**, read the session in your own Nitro routes:

```ts
// server/api/things.get.ts
import { getServerAuthSession } from '@thecodeorigin/auth/server'

export default defineEventHandler(async (event) => {
  const session = await getServerAuthSession(event)
  if (!session)
    throw createError({ statusCode: 401 })
  return { hello: session.email, org: session.activeOrg }
})
```

## Production: session storage

Session records are written through Nitro's storage layer under the
`sessionStorageBase` mount (`auth` by default). In development this is in-memory
/ filesystem and needs no setup. In production — especially on **Cloudflare
Workers** — bind a durable KV namespace to that mount:

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  nitro: {
    storage: {
      auth: { driver: 'cloudflareKVBinding', binding: 'AUTH_SESSIONS' },
    },
  },
})
```

Without a persistent mount, sessions evaporate between requests/instances and
users appear logged out.

## Next steps

- **[Concepts](/concepts)** — what an Organization, Application, Member,
  Consent, Ability, and Entitlement are, and how they relate.
- **[@thecodeorigin/auth API](/api)** — every composable, server util, route,
  module option, and contract type.
- **[Management REST API](/rest-api)** — managing apps, orgs, members, and
  consents programmatically with API keys.
