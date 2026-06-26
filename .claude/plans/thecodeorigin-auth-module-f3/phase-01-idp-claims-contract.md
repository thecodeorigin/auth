# Phase 1 — IdP userinfo claims (orgs / abilities / role) + shared contract

**Repo:** `D:\projects\better-auth`
**Goal:** Enrich `customUserInfoClaims` so a relying party gets everything it needs from one `/oauth2/userinfo` call: the full per-client `organizations[]` list, the effective `abilities[]` for the active role, and the user's **system** `role`. Define the wire contract as Zod so the module and the IdP agree.

No new HTTP endpoints in this phase. Backward compatible — existing `org`/`roles`/`personal`/`entitlement` keys are untouched.

---

## Step 1.1 — Add the shared claim contract

The contract is owned by the **module** (`packages/auth/src/contract/index.ts`, written in Phase 3) and re-exported for the IdP. To avoid a build-order dependency during this phase, create a thin IdP-local mirror that Phase 3 will replace with an import once the module is built.

> **Decision for cook:** if the module package is already built/linked when you reach this step, `import { UserinfoClaimsSchema, type UserinfoClaims, type RpOrganization } from '@thecodeorigin/auth/contract'` directly (the module + IdP share the pnpm workspace). Otherwise create `shared/auth-contract.ts` below and swap the import in Phase 6.

`shared/auth-contract.ts` (new):

```ts
import { z } from 'zod'

export const RpOrganizationSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  role: z.string(),          // active role for this org (access-grant override or member role)
  personal: z.boolean(),
})
export type RpOrganization = z.infer<typeof RpOrganizationSchema>

/** The full custom claim set emitted into /oauth2/userinfo for a relying party. */
export const UserinfoClaimsSchema = z.object({
  // existing, unchanged
  org: z.string().nullable(),
  roles: z.string().nullable(),
  personal: z.boolean(),
  entitlement: z
    .object({
      product: z.string(),
      plan: z.string(),
      status: z.string(),
      active: z.boolean(),
      currentPeriodEnd: z.number().nullable(),
    })
    .nullable(),
  // new in this phase
  organizations: z.array(RpOrganizationSchema),
  abilities: z.array(z.string()),     // flat "subject:action"
  role: z.string().nullable(),        // SYSTEM role (user.role); 'admin' => platform admin
})
export type UserinfoClaims = z.infer<typeof UserinfoClaimsSchema>
```

## Step 1.2 — `abilitiesForRole` from `#shared/permissions`

`shared/permissions.ts` already exports `statement`, `roles` (`owner`/`admin`/`member`) built from `ac.newRole({...})`. Add a flattener so the IdP emits the same `subject:action` strings the module's CASL will consume — single source of truth.

Append to `shared/permissions.ts`:

```ts
/**
 * Flatten an org role's statements into `subject:action` strings.
 * `roles` values are the objects returned by `ac.newRole(...)`; their grant map
 * is on `.statements`. Returns [] for an unknown role.
 */
export function abilitiesForRole(role: string | null | undefined): string[] {
  if (!role)
    return []
  const def = (roles as Record<string, { statements?: Record<string, readonly string[]> }>)[role]
  const statements = def?.statements
  if (!statements)
    return []
  const out: string[] = []
  for (const [subject, actions] of Object.entries(statements)) {
    for (const action of actions)
      out.push(`${subject}:${action}`)
  }
  return out
}
```

> Verify the runtime shape of `ac.newRole(...)` before relying on `.statements` — in some better-auth versions the grant map is the object itself. Quick check:
> ```bash
> node -e "import('./shared/permissions.ts').then(m=>console.log(JSON.stringify(m.roles.admin)))"
> ```
> If `.statements` is absent, the role object IS the statement map; then iterate `Object.entries(def)` directly. Pick whichever the log shows and keep `abilitiesForRole` consistent with `app/plugins/ability.ts:33` (which already reads `def.statements as ... Record<string, readonly string[]>`). The existing app plugin uses `.statements`, so default to that.

## Step 1.3 — `claimsResolveAll` (full granted-org list)

`server/services/claims.ts` already computes `candidates` (orgs the client may act in, tiered) but returns only `[0]`. Add a sibling that returns the **whole** list, joined to org name/slug.

Append to `server/services/claims.ts`:

```ts
import type { RpOrganization } from '#shared/auth-contract' // or '@thecodeorigin/auth/contract'

/**
 * All organizations the given client may act in for this user, default-closed
 * (same access-grant model as claimsResolve), ordered by the same byActive rule.
 * Returns [] when the client has no grants anywhere.
 */
export async function claimsResolveAll(userId: string, clientId?: string | null): Promise<RpOrganization[]> {
  try {
    const memberships = await db.query.member.findMany({
      where: (m, { eq }) => eq(m.userId, userId),
      with: { organization: true },
    })
    if (!memberships.length)
      return []

    const grants = clientId
      ? await db.query.access.findMany({ where: (s, { eq }) => eq(s.userId, userId) })
      : []

    interface Cand { row: Row, role: string, tier: 0 | 1, name: string, slug: string }
    const out: Cand[] = []
    for (const m of memberships) {
      const row: Row = {
        organizationId: m.organizationId,
        role: m.role,
        createdAt: m.createdAt ?? null,
        personal: orgParseMeta(m.organization?.metadata).personal === true,
      }
      const name = m.organization?.name ?? ''
      const slug = m.organization?.slug ?? m.organizationId
      if (!clientId) {
        out.push({ row, role: row.role, tier: 1, name, slug })
        continue
      }
      const orgGrants = grants.filter(s => s.organizationId === row.organizationId)
      const exact = orgGrants.find(s => s.clientId === clientId)
      if (exact) { out.push({ row, role: exact.role ?? row.role, tier: 0, name, slug }); continue }
      const star = orgGrants.find(s => s.clientId === STAR)
      if (star) { out.push({ row, role: star.role ?? row.role, tier: 1, name, slug }) }
      // else: default-closed, skip
    }
    out.sort((a, b) => a.tier - b.tier || byActive(a.row, b.row))
    return out.map(c => ({ id: c.row.organizationId, slug: c.slug, name: c.name, role: c.role, personal: c.row.personal }))
  }
  catch (error) {
    console.error('[auth] claimsResolveAll failed', userId, clientId, error)
    return []
  }
}
```

> `Row`, `STAR`, `byActive`, `orgParseMeta` already exist in `claims.ts` (and `orgParseMeta` is imported from `./org`). Reuse them — do not redefine.

## Step 1.4 — Enrich `customUserInfoClaims`

Edit `server/auth.config.ts` (the `customUserInfoClaims` hook, lines ~141–150). Import the new helpers at the top:

```ts
import { claimsResolve, claimsResolveAll } from './services/claims'
import { abilitiesForRole } from '#shared/permissions'
```

Replace the hook body:

```ts
async customUserInfoClaims({ user, jwt }) {
  const clientId = (jwt as { azp?: string, client_id?: string } | undefined)?.azp
    ?? (jwt as { client_id?: string } | undefined)?.client_id ?? null
  const [claims, organizations, entitlement] = await Promise.all([
    claimsResolve(user.id, clientId),
    claimsResolveAll(user.id, clientId),
    entitlementsResolve(user.id, clientId),
  ])
  return {
    ...claims,                                   // org, roles, personal
    organizations,                               // NEW: full granted list
    abilities: abilitiesForRole(claims.roles),   // NEW: effective subject:action[]
    role: (user as { role?: string | null }).role ?? null, // NEW: system role
    entitlement,
  }
}
```

> `user.role` is the system role column (nullable; `'admin'` = platform admin). The better-auth user object in this hook carries it; if typing complains, cast inline as shown (mirrors `server/utils/admin.ts`'s inline augmentation).

## Step 1.5 — `id_token` stays lean

Do **not** add `organizations`/`abilities` to `customIdTokenClaims` — the id_token is immutable/cacheable and these are live, per-call. Leave it returning `claimsResolve` only.

---

## Verification

```bash
pnpm dev   # restart so the auth plugin re-reads config
curl -X POST http://localhost:3000/_nitro/tasks/seed:idp   # ensure demo clients + access grants exist
node examples/sso-proof.mjs     # unchanged invariants still pass
node examples/authz-proof.mjs   # per-app scoping still passes
```

Then inspect a userinfo response (sso-proof prints tokens; or extend it): confirm the JSON now contains `organizations: [...]`, `abilities: ["project:read", ...]`, `role: null|admin`, and that `organizations` is **empty for a client with no access grant** (default-closed) and **scoped** (an org granted to client A does not appear for client B).

`pnpm lint && pnpm exec nuxi typecheck` → 0.

## Acceptance
- [ ] userinfo returns `organizations[]` (per-client, default-closed, ordered personal→oldest), `abilities[]`, system `role`.
- [ ] id_token unchanged; `sso-proof`/`authz-proof` green.
- [ ] `UserinfoClaimsSchema.parse(userinfo)` succeeds.
