# Test harness & demo clients

`auth.example.com` (local: `http://localhost:3000`, prod: `https://auth.thecodeorigin.com`)
is the OIDC Identity Provider. These examples are relying-party (RP) clients that
federate to it. **No auth-bypass endpoint exists** — all testing uses the
capabilities the product already ships: deterministic seeded credentials, admin
impersonation (dev only), and a scoped automation API key.

## Ports

| Service | Port | Stack |
|---|---|---|
| IdP (`auth.example.com`) | 3000 | Nuxt 4 + better-auth + NuxtHub D1 |
| Express RP | 3001 | `openid-client@6` (confidential) |
| Next RP | 3002 | `next-auth@5` (confidential) |
| Nuxt RP | 3003 | `nuxt-oidc-auth` (confidential) |
| Vue SPA | 3004 | `oauth4webapi@3` (**public**, PKCE-only) |

## Seeded test identities (`nuxt task run seed:idp`)

| Email | Password | Role | Org membership |
|---|---|---|---|
| `contact@thecodeorigin.com` | `AdminPass1!` | global `admin` | `org-demo` owner |
| `alice@seed.local` | `Passw0rd!` | user | `org-demo` `member` |
| `bob@seed.local` | `Passw0rd!` | user | `org-demo` `project-viewer` (dynamic role) |

The seed also creates a low-priv **automation API key** bound to `bob` (printed
**once** in the `seed:idp` task output — never committed). Re-running the seed is
idempotent and will not reprint it.

## How to test (capabilities, not backdoors)

### OIDC / SSO loop (scripted, deterministic)
```bash
# Single client, full Authorization-Code+PKCE loop; asserts RS256 id_token + kid in JWKS:
node examples/express/verify-oidc.mjs
# Against prod:  IDP=https://auth.thecodeorigin.com/api/auth CLIENT_SECRET=… node examples/express/verify-oidc.mjs

# THE headline test — SSO across all 4 clients from ONE sign-in (no re-login),
# plus public-client PKCE enforcement:
node examples/sso-proof.mjs
# Against prod:  IDP=https://auth.thecodeorigin.com/api/auth EMAIL=… PASSWORD=… \
#                NUXT_OIDC_{EXPRESS,NEXT,NUXT}_SECRET=… node examples/sso-proof.mjs
```

### Browser walkthrough (Chrome DevTools MCP / `verify` skill)
1. **Auth basics:** `:3000/sign-up` → register → the verification link is logged to
   the server console (dev has no email provider) → click it → signed in.
2. **SSO proof:** open Express `:3001` → "Sign in" → IdP `/sign-in` → authenticate →
   redirected back showing the user + an **RS256** `id_token` header. Then open the
   Vue SPA `:3004` → "Sign in" → **no credential prompt** (session reused) → user shown.
3. **Public client:** the Vue SPA (`:3004`) logs in with **no client secret** (PKCE only).

### Authorization matrix
```bash
# API key → session as the low-priv user (bob):
curl http://localhost:3000/api/auth/get-session -H "x-api-key: <seed key>"

# Dynamic-role permission check (sign in as bob, then):
curl -b cookies -X POST http://localhost:3000/api/auth/organization/has-permission \
  -H 'content-type: application/json' -H 'origin: http://localhost:3000' \
  -d '{"organizationId":"org-demo","permissions":{"project":["read"]}}'   # success:true
  # …{"project":["delete"]}  → success:false
```
Admin console at `:3000/admin/users` (dev) lists users, sets roles, and impersonates.
**Impersonation is disabled in production** (`server/middleware/impersonation-guard.ts`;
break-glass via `NUXT_ALLOW_IMPERSONATION=true`).

## Known behavior
- **No single-logout across root domains** (debate H3): signing out at the IdP does
  not revoke RP local sessions — each RP session lives until its own TTL. Front-channel
  logout (per-RP endpoints + IdP `end_session_endpoint` fan-out) is a scoped follow-up.
