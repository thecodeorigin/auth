# CLAUDE.md

Guidance for working in this repository.

## What this is

A self-hosted **OIDC / OAuth 2.1 identity provider** plus a **role-based
management console**, on Nuxt 4 + NuxtHub (Cloudflare D1) + better-auth (via
`@onmax/nuxt-better-auth`). The backend exposes the full OIDC surface, org RBAC,
API keys, and impersonation; the frontend is a `@nuxt/ui` v4 dashboard that
mirrors the architecture of `D:\projects\nuxt-template`.

## Stack

- **Nuxt 4** (SSR) + Nitro. **pnpm 10.7.0** only.
- **better-auth 1.6.16** with plugins: `admin`, `organization` (+
  `dynamicAccessControl`), `oauthProvider`, `apiKey`, `jwt` (RS256), `openAPI`.
  Configured in `server/auth.config.ts`; client in `app/auth.config.ts`.
- **NuxtHub** → Cloudflare D1 (prod) / libsql (dev), Drizzle ORM.
- **@nuxt/ui v4** + Tailwind v4, `@nuxt/icon` (locally bundled), `@nuxt/fonts`
  (self-hosted), `@vueuse/nuxt`.
- **CASL** (`@casl/ability` **v6** + `@casl/vue` v2) for client authorization.
- **nuxt-security** (strict global CSP), **nuxt-resend** (email).

## Project structure

```
app/                      # root shell
  app.vue                 # <UApp><NuxtLayout><NuxtPage>
  layouts/default.vue     # dashboard shell (UDashboardGroup) + impersonation banner
  layouts/auth.vue        # centered card for auth surfaces
  composables/            # useLayerRegistry, useInfiniteList, useActiveOrg, use*Api (data layer)
  plugins/ability.ts      # CASL $ability derived from the session
  lib/ofetch.ts           # $http — same-origin fetch for custom Nitro routes
  pages/                  # /, /403, error.vue, oauth/consent
layers/
  auth/                   # auth surfaces, account scope, API keys, user/impersonate menus
  organization/           # org switcher + org-scope pages (/orgs/:slug/*)
  admin/                  # platform (sysadmin) pages (/platform/*)
server/
  auth.config.ts          # better-auth server config (the IdP)
  api/                    # custom Nitro routes (everything else goes through the better-auth handler)
  services/               # DB logic (client, consent, access, org, claims)
  tasks/seed/             # seed:idp, seed:authz-fixtures
shared/permissions.ts     # CASL access-control statement + built-in roles (owner/admin/member)
```

Layers are **auto-discovered** from `layers/`. Each has a `nuxt.config.ts` with
`$meta.name`, which generates the `#layers/<name>/*` alias. There is no explicit
`extends`.

## Architecture

### Layer-registry navigation
The sidebar is data-driven. Each layer contributes nav items in
`app/plugins/99.contribute.<layer>.client.ts` via `useLayerRegistry().contribute({ navItems })`.
The `default` layout renders them. Nav items are **role-gated** and
**ability-gated**:
- `role?: 'admin' | 'member'` — admin-only items hide for members and vice-versa.
- `ability?: 'subject:action'` — shown only when `$ability.can(action, subject)`.
- `to` may contain `:slug` — the layout resolves it to the active org slug
  (and hides the item until an org is active).

### Role-based sidebar (the IA)
- **Member**: Applications (`/account/authorized-apps`), Users
  (`/orgs/:slug/members`), Invitations (`/orgs/:slug/invitations`), API Keys
  (`/account/api-keys`) + Settings group (Profile / Security / Connected Accounts).
- **Admin**: Applications (`/platform/applications`), Users, Organizations,
  Consents, API Keys, Providers (`/platform/*`) + Settings group.

### Authorization (`$ability`)
`app/plugins/ability.ts` builds a CASL ability from the live session: system
admin (`user.role === 'admin'`) → `manage all`; otherwise the active-org member
role is mapped through `#shared/permissions` statements. Routes gate via
`definePageMeta({ middleware: 'sysadmin' })` (platform) or `{ can: ['x:y'] }`;
the nav gate is cosmetic — **server endpoints are the authority**.

### Data layer — the composables
Per-domain composables wrap the better-auth client and are the **single source
of verified method names**: `useUsersApi` (`client.admin.*`), `useOrgApi`
(`client.organization.*`), `useApiKeysApi` (`client.apiKey.*`), `useAccountApi`
(core client methods), `useApplicationsApi` (`$http` to custom routes — there is
no `client.oauth2.*`). `useActiveOrg` resolves and auto-selects the active org.

## Hard rules

1. **Pages render under a layout.** `app.vue` wraps `<NuxtLayout>`. Dashboard
   pages use `<UDashboardPanel>` + `<DashboardNavbar>`; auth surfaces set
   `definePageMeta({ layout: 'auth', public: true })`.
2. **Nuxt UI components only** — no raw `<button>`/`<input>`/`<table>`.
   `components: false` (explicit imports). Filenames start with their folder
   (`Dashboard/DashboardNavbar.vue`). Icon-only buttons get `aria-label`.
3. **Semantic colors / tokens** — `text-muted`, `text-highlighted`,
   `bg-elevated`, `color="error|warning|success"`; `--ui-radius: 0`; primary
   blue, neutral gray.
4. **The better-auth client only has the session in the browser.** On SSR
   `useAuthClient()` is null. Any composable that calls it must run client-side:
   `onMounted`, or `useAsyncData(..., { server: false })`. Never call a `use*Api`
   method in plain SSR setup.
5. **OAuth client management goes through custom admin Nitro routes**, not the
   RFC-7592 better-auth endpoints (those want a registration token and 401 on a
   session). See `server/api/auth/oauth2/clients/*`.
6. **Secrets are shown exactly once** in a non-dismissible copy modal (client
   secret, API key); never re-fetched or re-displayed.
7. **Impersonation is session-sourced** (`session.impersonatedBy`), banner +
   destructive-action lockout live at the layout, with a `[Impersonating]` title
   prefix.
8. **Do not loosen the global CSP.** Icons are bundled locally and fonts
   self-hosted so both serve as `'self'`. Only social-avatar hosts are added to
   `img-src`. nuxt-security does not apply CSP to `/api/auth/**`, so the OIDC
   surface is unaffected.
9. **Zod at every server boundary.** Redirect URIs are restricted to
   `http(s)://`. Custom mutation routes are `requireAdmin`-gated.

## Workflow

```bash
pnpm dev                        # http://localhost:3000
curl -X POST http://localhost:3000/_nitro/tasks/seed:idp   # seed (dev server must be running)
pnpm lint                       # ESLint
pnpm exec nuxi typecheck        # vue-tsc — must be 0
node examples/sso-proof.mjs     # OIDC SSO invariant
node examples/authz-proof.mjs   # per-app claim scoping invariant
```

Verification oracles are lint + typecheck + the proof scripts + a live browser
walk (Chrome DevTools MCP). There is no Vitest/Playwright runner.

## Database (Drizzle / NuxtHub)

- `db` comes from `@nuxthub/db`; **named tables come from `@nuxthub/db/schema`**
  (`import { member } from '@nuxthub/db/schema'`), not the package root.
- **Migrations apply on `nuxt dev` boot.** Workflow: edit schema → `nuxi db
  generate` → restart `nuxt dev`. `nuxi db migrate` targets remote D1.
- The better-auth adapter **assigns its own ids** on `adapter.create` — always
  use the returned id for downstream rows. Drizzle `db.insert` honors explicit ids.
- All DB writes go through a service in `server/services/` (and, for fixtures, a
  task in `server/tasks/`), never ad-hoc SQL in a route.
- D1 has no FK cascade — clean up dependent rows explicitly (see the org hooks in
  `server/auth.config.ts` and `server/services/access.ts`).

## Gotchas

- Keep `packageManager` out of `package.json` (pins an uninstalled pnpm).
- `@libsql/client` is a required dev dependency for the local database.
- Restart `nuxt dev` after any auth-plugin change (schema is generated at module
  setup) and after `nuxi db generate`.
- `@better-auth/core@1.6.16` must be a **direct** dependency, and `@casl/ability`
  pinned to **v6** for `@casl/vue` v2 peer compatibility.
- The `apikey` table binds its owner via `referenceId`, not `userId`.
- After a hung/restarted dev server, `seed:idp` may fail with `[nuxt-hub] DB
  binding not found` — kill the process and `pnpm dev` afresh to rewire it.
- If `node_modules` corrupts (`#vite-node` errors), `rm -rf node_modules .nuxt &&
  pnpm install`.
