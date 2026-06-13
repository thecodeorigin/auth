# Phase 3 — Authorization (admin, organization + dynamic AC, api-key, claims, seed)

**Goal:** The authorization layer. Admin RBAC + guarded impersonation; organizations with a small ability-based (CASL-style) access-control statement and **dynamic** runtime roles; API keys for automation (scoped to a low-priv test user); authz claims carried in OIDC tokens; an idempotent seed. Depth kept minimal per YAGNI — prove each mechanism once, don't build a full console.

**Depends on:** P1 (P2 optional but recommended). **Unblocks:** P5 matrix testing.

## Steps

### P3.0 — Verify & install `@better-auth/api-key` (debate C5)
```bash
pnpm add @better-auth/api-key
node -e "console.log(Object.keys(require('@better-auth/api-key')))"  # confirm `apiKey` export
```
Confirm the option that mints a session from a key (`enableSessionForAPIKeys` per docs — **verify exact name** in the installed package's types). If the package doesn't exist for the pinned version, check `better-auth/plugins` exports instead. Record the resolved import path in `server/auth.config.ts` comments.

### P3.1 — Permission catalog (`server/utils/permissions.ts`)
The single source of ability keys (small per YAGNI — 3 resources). CASL-compatible ability model.
```ts
import { createAccessControl } from 'better-auth/plugins/access'

export const statement = {
  project: ['create', 'read', 'update', 'delete'],
  member: ['create', 'update', 'delete'],
  role: ['create', 'update', 'delete'], // needed for dynamic-AC role creation (the `ac` resource)
} as const

export const ac = createAccessControl(statement)

export const member = ac.newRole({ project: ['read'] })
export const admin = ac.newRole({
  project: ['create', 'read', 'update'],
  member: ['create', 'update'],
  role: ['create', 'update', 'delete'],
})
export const owner = ac.newRole({
  project: ['create', 'read', 'update', 'delete'],
  member: ['create', 'update', 'delete'],
  role: ['create', 'update', 'delete'],
})
export const roles = { owner, admin, member }
```

### P3.2 — Add plugins to `server/auth.config.ts`
```ts
import { admin as adminPlugin, organization } from 'better-auth/plugins'
import { apiKey } from '@better-auth/api-key' // path per P3.0
import { ac, roles } from './utils/permissions'

// inside plugins: [ ...jwt, oidcProvider, ]
adminPlugin({
  // C6: in prod, restrict to an explicit allowlist and disable impersonation (P6 toggles via env).
  adminUserIds: runtimeConfig.adminUserIds ? runtimeConfig.adminUserIds.split(',') : [],
  impersonationSessionDuration: 60 * 30,
}),
organization({
  ac,
  roles,
  dynamicAccessControl: { enabled: true, maximumRolesPerOrganization: 10 },
}),
apiKey({
  enableSessionForAPIKeys: true, // C5: scope keys to a low-priv test user; never admin/owner
}),
```
Update `oidcProvider.getAdditionalUserInfoClaim` (Q5 — apps enforce locally on these claims):
```ts
getAdditionalUserInfoClaim: async (user, _scopes) => {
  // include active org + roles so RPs authorize without calling back to the IdP
  const membership = await /* query member table for user.id */ undefined
  return { org: membership?.organizationId ?? null, roles: membership?.role ?? null }
},
```

### P3.3 — Client plugins (`app/auth.config.ts`)
```ts
import { defineClientAuth } from '@onmax/nuxt-better-auth/config'
import { adminClient, organizationClient, apiKeyClient } from 'better-auth/client/plugins'
import { ac, roles } from '~~/server/utils/permissions' // shared statement

export default defineClientAuth({
  plugins: [
    adminClient(),
    organizationClient({ ac, roles, dynamicAccessControl: { enabled: true } }),
    apiKeyClient(),
  ],
})
```

### P3.4 — Regenerate schema (RESTART REQUIRED)
```bash
npx nuxt dev
npx nuxt db generate   # +admin fields on user (role/banned), organization/member/invitation, organizationRole (dynamic AC JSON), apikey
```
Hand-review and commit. Confirm only ADDs (debate D1).

### P3.5 — Idempotent seed (`server/tasks/seed/idp.ts`) — use the `data` skill
Nitro task wrapping a service; idempotent via upsert on stable keys (debate D2/D3). Seeds:
- **system admin** user (email from `runtimeConfig.seedAdminEmail`) with `role: 'admin'`.
- **demo organization** + the static `owner`/`admin`/`member` roles.
- **one dynamically-created custom role** (e.g. `project-viewer` → `{ project: ['read'] }`) to prove dynamic AC. **Validate the ability JSON with Zod before write; permission checks must fail closed.**
- **deterministic test users** per role (known passwords) for browser testing.
- **a low-priv automation API key** bound to a test user (printed once to the task log; not committed).
- *(OAuth clients foo/bar/baz are config `trustedClients`, not DB rows — no seed needed unless using dynamic registration.)*

Run: `npx nuxt task run seed:idp` (or the module's task runner path). Re-running must not duplicate.

### P3.6 — Minimal admin UI (`app/pages/admin/users.vue`)
Only what's needed to drive testing (YAGNI): list users (`admin.listUsers`), set role (`admin.setRole`), **impersonate** (`admin.impersonate` → start a session as that user; "stop impersonating" banner). No org/role/key/client CRUD UIs — those go through seed + config. Guard the route to admins.

## Acceptance criteria
- [ ] `@better-auth/api-key` import resolved; an API key bound to the test user mints a working session (`getSession` with `x-api-key` header returns that user).
- [ ] Admin can list users, set a role, and impersonate a user in dev; "stop impersonating" restores the admin session.
- [ ] `auth.api.hasPermission` returns true for `{ project: ['read'] }` for a member and false for `{ project: ['delete'] }`; the **dynamically created** `project-viewer` role grants exactly its JSON-defined ability.
- [ ] A decoded OIDC `id_token`/userinfo for a member includes the `org` and `roles` claims (proves app-local enforcement is possible).
- [ ] `seed:idp` is idempotent (run twice → no duplicates).

## Notes for cook
- Permission checks **fail closed** on malformed ability JSON (debate D2).
- Keep the automation key's user non-admin (debate C5/C6).
