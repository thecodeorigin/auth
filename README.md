# Auth — OIDC Identity Provider & Management Console

A self-hosted **OpenID Connect / OAuth 2.1 identity provider** with a complete
**management console**, built on Nuxt 4 + NuxtHub (Cloudflare D1) and
[better-auth](https://better-auth.com).

Log in once and reach every registered application. Administer users,
organizations, OAuth applications, API keys and social-login providers from a
role-aware dashboard. Let organization owners manage their own members,
invitations and per-app access.

## What's inside

**Identity provider**
- Email + password with required email verification, password reset, and
  social login (Google, GitHub).
- Full OIDC surface: authorization code + PKCE, refresh tokens, RS256-signed
  `id_token`, `userinfo`, JWKS, token introspection, end-session, and dynamic
  client registration.
- Per-application identity claims — each app receives the user's organization
  and roles scoped to that app (default-closed).
- API keys with session semantics for machine-to-machine and agent use.
- User impersonation for support (time-boxed, audited, banner-guarded).

**Management console**
- **Members** get a lean, business-facing console: their authorized
  applications, their organization's users and invitations, their API keys, and
  account settings.
- **System administrators** get the full platform: OAuth application
  credentials (Google-style create + rotate + redirect URIs), all users and
  organizations, consent grants, platform API keys, and social-provider setup.
- Built on @nuxt/ui v4 with a collapsible dashboard shell, org switcher,
  command palette (`Ctrl/⌘ K`), and CASL-driven permission gating.

## Tech stack

| Area | Choice |
|---|---|
| Framework | Nuxt 4 (SSR), Nitro |
| Auth | better-auth via `@onmax/nuxt-better-auth` (admin, organization, oauth-provider, api-key, jwt plugins) |
| Database | NuxtHub → Cloudflare D1 in production, local libsql in development (Drizzle ORM) |
| UI | `@nuxt/ui` v4, Tailwind v4, locally-bundled `@nuxt/icon`, self-hosted `@nuxt/fonts` |
| Authorization | CASL (`@casl/ability` + `@casl/vue`) derived from the session |
| Security | `nuxt-security` (strict CSP, rate limiting, CSRF) |
| Email | `nuxt-resend` |
| Hosting | Cloudflare Workers |

## Requirements

- **Node 22+**
- **pnpm 10.7.0** — do not add a `packageManager` field to `package.json`
  (it pins a version that isn't installed and breaks every pnpm call).

## Setup

```bash
pnpm install
```

Create a `.env` (covered by `.gitignore`). The only required secret is the
auth signing key:

```bash
NUXT_BETTER_AUTH_SECRET=<at-least-32-characters>

# Optional — social login (also configurable from the Providers screen)
NUXT_GOOGLE_CLIENT_ID=
NUXT_GOOGLE_CLIENT_SECRET=
NUXT_GITHUB_CLIENT_ID=
NUXT_GITHUB_CLIENT_SECRET=

# Optional — transactional email
NUXT_RESEND_API_KEY=
```

## Development

```bash
pnpm dev          # http://localhost:3000
```

The local database lives in libsql. **Migrations apply on `nuxt dev` boot** —
after changing the schema, run `pnpm exec nuxi db generate` and restart the dev
server. Restart the dev server after any change to the auth configuration, too
(the Drizzle schema is generated at module setup).

### Seed demo data

With the dev server running:

```bash
curl -X POST http://localhost:3000/_nitro/tasks/seed:idp
```

This creates a system admin, a demo organization, a dynamic role, demo OAuth
clients (written to `examples/.clients.json`), and test users:

| Account | Email | Password |
|---|---|---|
| System admin | `contact@thecodeorigin.com` | `AdminPass1!` |
| Org member | `alice@seed.local` | `Passw0rd!` |
| Dynamic-role member | `bob@seed.local` | `Passw0rd!` |

## Verify

There is no unit/e2e runner; correctness is proven by static checks, the live
app, and backend proof scripts:

```bash
pnpm lint                       # ESLint
pnpm exec nuxi typecheck        # vue-tsc
node examples/sso-proof.mjs     # one sign-in → all clients, PKCE enforced
node examples/authz-proof.mjs   # id_token org/roles scoped per app
```

## Production

```bash
pnpm build
```

Deploys to Cloudflare Workers (`cloudflare-module` preset) with a D1 database;
NuxtHub generates the bindings from the production config. Resource IDs are
injected from build-time environment variables. Live at
`id.thecodeorigin.com`.

## Concepts

- **Organizations** — every verified user gets a Personal organization on first
  sign-in. Owners can create more. Built-in roles are `owner`, `admin`,
  `member`; organizations may also define dynamic roles.
- **App access** — within an organization, a member's access can be scoped per
  application (`*` = all apps; specific grants override). This drives the
  org/roles claims each application sees.
- **Consents** — the record of which user authorized which application for which
  scopes; revocable by the user (Authorized Apps) or an admin (Consents).
