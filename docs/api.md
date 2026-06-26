# `@thecodeorigin/auth` API

The complete reference for the relying-party module: module options, the
`useAuth()` and `useCasl()` composables, the routes and API endpoints it mounts,
the server utilities, and the shared contract types.

The package exposes three entry points:

| Import | Use |
| --- | --- |
| `@thecodeorigin/auth` | the Nuxt module (added to `modules`) |
| `@thecodeorigin/auth/server` | server utilities for your own Nitro routes |
| `@thecodeorigin/auth/contract` | shared Zod schemas + types (RP ↔ IdP) |

## Module options

Configured under the `auth` key in `nuxt.config.ts`.

```ts
interface ModuleOptions {
  domain: string // IdP host, e.g. 'id.thecodeorigin.com' — no protocol/path
  scopes?: string[] // default: ['openid', 'profile', 'email']
  sessionStorageBase?: string // Nitro storage mount for sessions — default: 'auth'
  sessionCookieName?: string // session-id cookie — default: 'tco_auth'
  routes?: Partial<AuthRoutes>
}

interface AuthRoutes {
  signIn: string // default: '/auth/sign-in'
  callback: string // default: '/auth/callback'
  signOut: string // default: '/auth/sign-out'
  home: string // default: '/'
  error: string // default: '/auth/sign-in'
}
```

| Option | Default | Notes |
| --- | --- | --- |
| `domain` | `''` | **Required.** Host only. The module builds `https://<domain>/api/auth/oauth2/*`. |
| `scopes` | `['openid','profile','email']` | Requested at the authorize step. |
| `sessionStorageBase` | `'auth'` | Bind a KV namespace to this Nitro mount in production. |
| `sessionCookieName` | `'tco_auth'` | Opaque session-id cookie (httpOnly). |
| `routes` | see above | Override any subset; the rest keep defaults. |

`clientId` and `clientSecret` are **not** module options — they are runtime
config provided via environment (see
[Getting Started → credentials](/getting-started#step-3-provide-the-client-credentials)):

```ts
// what the module registers internally
runtimeConfig.auth = { clientSecret, sessionStorageBase, sessionCookieName } // server-only
runtimeConfig.public.auth = { domain, clientId, routes, scopes } // public
```

| Env var | Runtime path |
| --- | --- |
| `NUXT_AUTH_CLIENT_SECRET` | `auth.clientSecret` |
| `NUXT_PUBLIC_AUTH_CLIENT_ID` | `public.auth.clientId` |
| `NUXT_PUBLIC_AUTH_DOMAIN` | `public.auth.domain` |

## What the module adds

On setup, the module wires up everything automatically — you don't import any of
this:

- **Server routes** (the OIDC flow): `signIn`, `callback`, `signOut`.
- **Server API** (session + RP actions): under `/api/_auth/*`.
- **Composables** (auto-imported): `useAuth`, `useCasl`.
- **Global route middleware**: `auth` (enforces sign-in) and `casl` (enforces
  `definePageMeta({ can })`).
- **Plugins**: session hydration + the CASL `$ability`.
- **Server utils** (auto-imported in Nitro): `getServerAuthSession`, etc.

---

## `useAuth()`

The primary composable. Auto-imported; safe to call anywhere in the app.

```ts
const {
  session,
  user,
  loggedIn,
  abilities,
  impersonator,
  isImpersonating,
  getOrganizations,
  switchOrganization,
  getImpersonatableUsers,
  impersonate,
  stopImpersonating,
  signIn,
  signOut,
  refresh,
} = useAuth()
```

### Reactive state

| Member | Type | Description |
| --- | --- | --- |
| `session` | `Ref<PublicSession \| null>` | The live public session (no tokens). `null` when signed out. |
| `user` | `ComputedRef<PublicUser \| null>` | `{ sub, email, name, picture }`. |
| `loggedIn` | `ComputedRef<boolean>` | `true` when a session exists. |
| `abilities` | `ComputedRef<AbilityRule[]>` | Raw CASL rules from the IdP. |
| `impersonator` | `ComputedRef<PublicUser \| null>` | The admin behind an impersonated session, if any. |
| `isImpersonating` | `ComputedRef<boolean>` | `true` during impersonation. |

### Auth actions

#### `signIn(redirect?: string): Promise<...>`
Sends the browser to the sign-in route (external navigation), kicking off the
OIDC flow. `redirect` is a path to return to after login.

```ts
signIn('/dashboard')
```

#### `signOut(): Promise<...>`
Navigates to the sign-out route, which destroys the server session and notifies
the IdP end-session endpoint.

#### `refresh(): Promise<void>`
Re-fetches `/api/_auth/session` and updates `session`. Call after an action that
may have changed claims server-side.

### Organization methods

#### `getOrganizations(): RpOrganization[]`
Returns the organizations on the current session (synchronous — reads session
state).

#### `switchOrganization(orgId: string): Promise<void>`
Sets the active organization and refreshes the session (which re-resolves
abilities/claims for the new active org).

```ts
await switchOrganization(org.id)
```

### Impersonation methods

Admin-only; the server enforces the rules (see [Concepts → Impersonation](/concepts#impersonation)).

#### `getImpersonatableUsers(query?): Promise<{ items: ImpersonationCandidate[], hasMore: boolean }>`
Paginated search of users the admin may impersonate.

```ts
const { items, hasMore } = await getImpersonatableUsers({ q: 'alice', limit: 20, offset: 0 })
```

#### `impersonate(userId: string): Promise<void>`
Begins impersonating `userId`; the session flips to the target user with
`impersonator` set.

#### `stopImpersonating(): Promise<void>`
Ends impersonation and restores the admin's own session.

---

## `useCasl()`

A thin wrapper over the CASL `$ability` for imperative checks.

```ts
const { ability, can, cannot } = useCasl()

can('view', 'project') // boolean
cannot('delete', 'project') // boolean
can('update', 'project', 'name') // optional field-level check
ability // the raw MongoAbility instance
```

| Member | Signature | Description |
| --- | --- | --- |
| `can` | `(action, subject, field?) => boolean` | True if the rule allows it. |
| `cannot` | `(action, subject, field?) => boolean` | Inverse of `can`. |
| `ability` | `MongoAbility` | The underlying CASL instance (`$ability`). |

> The same `$ability` powers the global `casl` middleware. Prefer
> `definePageMeta({ can: ['subject:action'] })` for whole pages and `useCasl()`
> for in-component branching.

---

## Routes & endpoints the module mounts

### OIDC server routes
These are server route handlers (browser navigations), named by your `routes`
config.

| Route (default) | Purpose |
| --- | --- |
| `GET /auth/sign-in` | Starts the Authorization Code + PKCE flow; sets `state`/`verifier` cookies; 302s to the IdP `authorize` endpoint. Returns **503** if `domain`/`clientId`/`clientSecret` are unset. Accepts `?redirect=`. |
| `GET /auth/callback` | Validates `state`, exchanges the code (PKCE) at the IdP `token` endpoint, fetches `userinfo`, requires a **verified email**, writes the session record + cookie, 302s to the saved redirect. On failure, 302s to the `error` route with `?error=`. |
| `GET /auth/sign-out` | Destroys the server session and best-effort calls the IdP `endsession` endpoint, then 302s home. |

### Server API (`/api/_auth/*`)
These back the `useAuth()` methods. You normally call them through the
composable, not directly.

| Endpoint | Backs |
| --- | --- |
| `GET /api/_auth/session` | `refresh()` |
| `GET /api/_auth/organizations` | (session orgs) |
| `POST /api/_auth/organizations/switch` | `switchOrganization()` |
| `GET /api/_auth/impersonatable-users` | `getImpersonatableUsers()` |
| `POST /api/_auth/impersonate` | `impersonate()` |
| `POST /api/_auth/stop-impersonating` | `stopImpersonating()` |

---

## Page meta flags

Read by the global middleware:

| Flag | Effect |
| --- | --- |
| `definePageMeta({ public: true })` | Page is reachable while signed out. |
| `definePageMeta({ unauthenticatedOnly: true })` | Redirects to `home` if already signed in. |
| `definePageMeta({ can: ['subject:action', …] })` | Requires **all** listed abilities; redirects to `/403` otherwise. |

```ts
definePageMeta({ can: ['project:view', 'project:list'] })
```

---

## Server utilities (`@thecodeorigin/auth/server`)

For your own Nitro routes.

### `getServerAuthSession(event): Promise<ServerAuthSession | null>`

Returns a **token-free** session projection, or `null` if unauthenticated.

```ts
import { getServerAuthSession } from '@thecodeorigin/auth/server'

export default defineEventHandler(async (event) => {
  const session = await getServerAuthSession(event)
  if (!session)
    throw createError({ statusCode: 401 })
  // session.sub, session.email, session.systemRole, session.abilities,
  // session.organizations, session.activeOrg, session.entitlement,
  // session.isImpersonation, session.impersonator
})
```

```ts
interface ServerAuthSession {
  sub: string
  email: string
  name: string | null
  picture: string | null
  systemRole: string | null
  abilities: AbilityRule[]
  organizations: RpOrganization[]
  activeOrg: string | null
  entitlement: {
    product: string
    plan: string
    status: string
    active: boolean
    currentPeriodEnd: number | null
  } | null
  isImpersonation: boolean
  impersonator: PublicUser | null
}
```

> The same function is auto-imported inside your Nitro server (no explicit import
> needed in `server/`). The `/server` export exists for explicit/typed imports.

---

## Contract types (`@thecodeorigin/auth/contract`)

Zod schemas + inferred types shared between the RP and the IdP. Import the schema
to validate, or the type for annotations.

### `PublicSession`
The browser-visible session — **no tokens**.

```ts
interface PublicSession {
  user: PublicUser
  abilities: AbilityRule[]
  systemRole: string | null
  organizations: RpOrganization[]
  activeOrg: string | null
  entitlement: { product: string, plan: string, status: string, active: boolean, currentPeriodEnd: number | null } | null
  impersonator: PublicUser | null
}
```

### `PublicUser`
```ts
interface PublicUser { sub: string, email: string, name: string | null, picture: string | null }
```

### `RpOrganization`
```ts
interface RpOrganization { id: string, slug: string, name: string, role: string, personal: boolean }
```

### `AbilityRule`
A single CASL rule, as emitted into `userinfo`.

```ts
interface AbilityRule { action: string, subject: string, conditions?: Record<string, string> }
```

### `UserinfoClaims`
The full claim set the IdP returns from `/oauth2/userinfo` (consumed by the
callback handler).

```ts
interface UserinfoClaims {
  org: string | null
  roles: string | null
  personal: boolean
  entitlement: { product: string, plan: string, status: string, active: boolean, currentPeriodEnd: number | null } | null
  organizations: RpOrganization[]
  abilities: AbilityRule[]
  role: string | null
}
```

### `ImpersonationCandidate`
```ts
interface ImpersonationCandidate { id: string, email: string, name: string | null, image: string | null }
```

Each `*Schema` export (`PublicSessionSchema`, `AbilityRuleSchema`,
`UserinfoClaimsSchema`, …) is the Zod source of truth for its type.

---

## CASL ability plugin

The module installs a plugin that builds `$ability` from the live session and
keeps it in sync:

- System admins (`systemRole === 'admin'`) get **`manage all`**.
- Everyone else gets the `abilities` array mapped into CASL rules (including
  `conditions` when present).
- The ability **re-derives automatically** whenever `session` changes (e.g.
  after `switchOrganization` or `impersonate`).

`$ability` is available via `useCasl()`, the global `casl` middleware, and (since
`useGlobalProperties` is on) directly in templates through `@casl/vue`.
