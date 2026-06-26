# Management REST API

The platform exposes an HTTP API for managing **applications, organizations,
members, app-access, consents, and users**. This page covers how to authenticate
to it — including with **API keys** — and the endpoints you can call.

All endpoints live at the IdP origin, e.g. `https://id.thecodeorigin.com`.

## Authentication

There are two ways to authenticate a management call. **Both resolve to the same
thing: a user with a role.** Authorization is then decided by that user's role —
there is no separate "API scope" system.

### 1. Session cookie
A browser/console call carries the `better-auth` session cookie. This is what the
management UI uses.

### 2. API key
A server-to-server call sends an API key in the **`x-api-key`** header. The
platform enables `apiKey({ enableSessionForAPIKeys: true })`, which means **a
valid API key is promoted to a full session for the key's owner.** Every guard
that accepts a session therefore also accepts an API key.

```bash
curl https://id.thecodeorigin.com/api/auth/oauth2/clients \
  -H "x-api-key: $API_KEY"
```

> **The key inherits its owner's authority — nothing more.** An API key is bound
> to a user via `referenceId`. A call made with that key runs **as that user**.
> So to reach admin-only endpoints, the key's owner must be a system admin (or
> listed in `NUXT_ADMIN_USER_IDS`). A key owned by a regular user can only reach
> what that user could reach.

### How the guards decide

| Guard | Used by | Passes when… |
| --- | --- | --- |
| `requireAdmin` | Applications, admin consents, user admin | session/key owner has `user.role === 'admin'` **or** is in `NUXT_ADMIN_USER_IDS` |
| `requireUserSession` | catalog list, providers, billing | any authenticated user (incl. API key) |
| `orgAssertAdmin(orgId)` | per-org member/access routes | owner is a member of **that org** with role `owner` or `admin` |

`requireAdmin` returns **401** if there's no session/key at all, and **403** if
the caller isn't an admin.

## Managing API keys

API keys are **personal** — each belongs to a user. Create and manage them
through the better-auth `api-key` endpoints (session-authenticated), or with the
client SDK.

### Create a key

```bash
curl -X POST https://id.thecodeorigin.com/api/auth/api-key/create \
  -H "Cookie: <session-cookie>" \
  -H "Content-Type: application/json" \
  -d '{ "name": "ci-bot", "expiresIn": 2592000, "prefix": "ci" }'
```

With the client SDK (`useApiKeysApi()` in the console wraps these):

```ts
const client = useAuthClient()
const { key } = await client.apiKey.create({
  name: 'ci-bot',
  expiresIn: 60 * 60 * 24 * 30, // seconds, or null for no expiry
  prefix: 'ci',
  metadata: { team: 'platform' },
})
// `key` is the plaintext value — shown EXACTLY ONCE, store it now.
```

The raw key is returned **once** and stored hashed; it can never be re-fetched.

### Other key operations

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/auth/api-key/create` | POST | Create a key (returns plaintext once). |
| `/api/auth/api-key/list` | GET | List the caller's keys (metadata only). |
| `/api/auth/api-key/get` | GET | Get one key's metadata (`?id=`). |
| `/api/auth/api-key/update` | POST | Rename / enable / disable (`{ keyId, name?, enabled? }`). |
| `/api/auth/api-key/delete` | POST | Revoke a key (`{ keyId }`). |

> To use an API key for **admin** automation, have a system admin create the key
> (so its owner is an admin), then send it as `x-api-key`.

---

## Endpoints

### Applications (OAuth clients)

Custom admin routes — OAuth client management does **not** use the RFC-7592
endpoints. All mutations require `requireAdmin`.

| Method | Path | Auth | Body / Notes |
| --- | --- | --- | --- |
| `GET` | `/api/auth/oauth2/clients` | any session | Catalog: `[{ clientId, name, disabled }]` — no secrets. |
| `GET` | `/api/auth/oauth2/clients/:id` | admin | Full client incl. `redirectUris`, flags, ability map. |
| `POST` | `/api/auth/oauth2/clients` | admin | `{ name, redirectUris, type?, public?, skipConsent? }` → returns `clientSecret` **once**. |
| `PATCH` | `/api/auth/oauth2/clients/:id` | admin | `{ name?, redirectUris?, skipConsent?, disabled?, abilities? }` (≥1 field). |
| `POST` | `/api/auth/oauth2/clients/:id/rotate-secret` | admin | New secret **once**; 400 if the client is `public`. |
| `DELETE` | `/api/auth/oauth2/clients/:id` | admin | Delete the client. |

```bash
# Create a confidential web client
curl -X POST https://id.thecodeorigin.com/api/auth/oauth2/clients \
  -H "x-api-key: $ADMIN_API_KEY" -H "Content-Type: application/json" \
  -d '{ "name": "My Dashboard", "redirectUris": ["https://app.example.com/auth/callback"], "type": "web" }'
```

- `redirectUris` are restricted to `http(s)://`.
- `public: true` ⇒ PKCE-only, **no** client secret.
- `abilities` is the per-role ability map — see
  [Concepts → Ability](/concepts#ability).

### Application access (per org, per member)

Grant which apps a member may use, and as what role. All require
`orgAssertAdmin(orgId)` — the caller must be an `owner`/`admin` of **that** org.

| Method | Path | Body / Notes |
| --- | --- | --- |
| `GET` | `/api/orgs/:orgId/members/:userId/access` | List the member's app grants. |
| `POST` | `/api/orgs/:orgId/members/:userId/access` | `{ clientId, role? }` — upsert a grant. `clientId: '*'` = all apps; `role: null` = inherit base role. |
| `DELETE` | `/api/orgs/:orgId/members/:userId/access/:clientId` | Revoke one grant. |

```bash
# Let a member use one app as "admin"
curl -X POST https://id.thecodeorigin.com/api/orgs/$ORG/members/$USER/access \
  -H "x-api-key: $ORG_ADMIN_KEY" -H "Content-Type: application/json" \
  -d '{ "clientId": "oc_abc123", "role": "admin" }'
```

### Consents

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/auth/oauth2/get-consents` | session | The **caller's own** consents. |
| `POST` | `/api/auth/oauth2/delete-consent` | session | Revoke one of the caller's consents. |
| `GET` | `/api/admin/consents` | admin | **All** consents across users: `[{ id, clientId, clientName, userId, userEmail, scopes, createdAt }]`. |
| `DELETE` | `/api/admin/consents/:id` | admin | Revoke any consent by id. |

### Providers

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/providers` | session | Social-provider config status: `{ providers: [{ id, label, configured }] }` (Google, GitHub). |

### Users (better-auth admin plugin)

Mounted under `/api/auth/admin/*`; all require `requireAdmin`. Notable ones:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/admin/list-users` | Search/paginate users. |
| `POST` | `/api/auth/admin/create-user` | Create a user. |
| `POST` | `/api/auth/admin/update-user` | Update fields. |
| `POST` | `/api/auth/admin/set-role` | Set system role (`admin` / `user`). |
| `POST` | `/api/auth/admin/set-password` | Set a user's password. |
| `POST` | `/api/auth/admin/ban-user` · `/unban-user` | Ban / unban. |
| `POST` | `/api/auth/admin/remove-user` | Delete a user. |
| `GET` | `/api/auth/admin/list-user-sessions` | List a user's sessions. |
| `POST` | `/api/auth/admin/revoke-user-session(s)` | Revoke one / all sessions. |

### Organizations & members (better-auth organization plugin)

Mounted under `/api/auth/organization/*`; session-authenticated, with
ownership/role enforced server-side. Notable ones:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/auth/organization/list` | The caller's orgs. |
| `POST` | `/api/auth/organization/create` | Create an org. |
| `POST` | `/api/auth/organization/update` · `/delete` | Update / delete (owner). |
| `POST` | `/api/auth/organization/set-active` | Set active org. |
| `GET` | `/api/auth/organization/get-full-organization` | Org + members. |
| `GET` | `/api/auth/organization/list-members` | Members of an org. |
| `POST` | `/api/auth/organization/invite-member` | Send an invitation. |
| `POST` | `/api/auth/organization/remove-member` | Remove a member. |
| `POST` | `/api/auth/organization/update-member-role` | Change a member's role. |
| `GET` | `/api/auth/organization/list-invitations` | Pending invitations. |
| `POST` | `/api/auth/organization/accept-invitation` · `/cancel-invitation` | Accept / cancel. |
| `GET`/`POST` | `/api/auth/organization/(list\|create\|update\|delete)-role` | Custom roles (dynamic AC). |

---

## Worked example — admin automation with an API key

```bash
# 0. (once) a system admin creates a key — store the plaintext output.
KEY=$(curl -s -X POST https://id.thecodeorigin.com/api/auth/api-key/create \
  -H "Cookie: $ADMIN_SESSION" -H "Content-Type: application/json" \
  -d '{ "name": "platform-automation" }' | jq -r .key)

# 1. Register an OAuth client for a new app.
curl -s -X POST https://id.thecodeorigin.com/api/auth/oauth2/clients \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{ "name": "Reporting", "redirectUris": ["https://reporting.example.com/auth/callback"] }'

# 2. Audit who has consented to which apps.
curl -s https://id.thecodeorigin.com/api/admin/consents -H "x-api-key: $KEY"

# 3. Promote a user to admin.
curl -s -X POST https://id.thecodeorigin.com/api/auth/admin/set-role \
  -H "x-api-key: $KEY" -H "Content-Type: application/json" \
  -d '{ "userId": "usr_…", "role": "admin" }'
```

## Error responses

| Status | Meaning |
| --- | --- |
| `400` | Validation failed (Zod), or an invalid operation (e.g. rotating a public client's secret). |
| `401` | No valid session or API key. |
| `403` | Authenticated, but not an admin (or not an admin of the target org). |
| `404` | Target (client, org, member, consent) not found. |

## Notes & caveats

- **Secrets are shown once.** Client secrets and API keys are returned exactly
  once and stored hashed — there is no "reveal" endpoint.
- **No per-key scopes.** A key's reach equals its owner's role; there is no
  independent permission/scope system on keys today. Scope automation by
  choosing the **owner** of the key accordingly.
- **Org routes check the target org**, not your active org — preventing
  cross-org (IDOR) access.
- **`/api/auth/**` is the better-auth handler.** The platform's strict CSP is not
  applied to it, so the OIDC and admin/org/api-key surfaces are unaffected by
  CSP.
