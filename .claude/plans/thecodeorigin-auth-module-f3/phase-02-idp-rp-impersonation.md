# Phase 2 — IdP RP impersonation endpoints (hardened) + audit table

**Repo:** `D:\projects\better-auth`
**Goal:** Let a relying party (holding a user's access token) list impersonatable users and impersonate one — without the RP ever talking to a browser session. Closes debate C1–C5: non-refreshable, absolute TTL, admins excluded as targets, re-impersonation rejected, audited, break-glass-gated.

**Depends on:** Phase 1 (contract).

> **Open Q1** — confirm exposing impersonation through the RP + adding the `impersonationAudit` table before building. Alternative (RFC 8693) in `research/debate-synthesis.md` §P0.

---

## Step 2.1 — `impersonationAudit` table

Add to the IdP Drizzle schema (the project keeps named tables in `@nuxthub/db/schema`; follow the existing pattern used for `access`/`subscription`). Find where app-owned tables are declared (search `sqliteTable(` under `server/` / the schema module that feeds `@nuxthub/db/schema`) and add:

```ts
export const impersonationAudit = sqliteTable('impersonationAudit', {
  id: text('id').primaryKey(),
  impersonatorId: text('impersonatorId').notNull(),
  targetId: text('targetId').notNull(),
  clientId: text('clientId').notNull(),
  action: text('action').notNull(),           // 'start' | 'stop'
  tokenId: text('tokenId'),                    // oauthAccessToken.id of the minted token
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
})
```

Then:
```bash
pnpm exec nuxi db generate
pnpm dev   # migrations apply on boot
```

> If the app's tables live alongside better-auth generated tables, mirror exactly how `access`/`subscription` are declared and exported so `@nuxthub/db/schema` re-exports `impersonationAudit`. Per CLAUDE.md, all writes go through a service (`rp.ts` below), never ad-hoc SQL.

## Step 2.2 — `server/services/rp.ts` (new)

```ts
import type { H3Event } from 'h3'
import { db } from '@nuxthub/db'
import { impersonationAudit, oauthAccessToken, user } from '@nuxthub/db/schema'
import { and, eq, like, ne, or, sql } from 'drizzle-orm'
import { randomToken } from '../utils/nanoid'

const IMP_PREFIX = 'imp:' // encoded into oauthAccessToken.referenceId for minted tokens
const IMP_TTL_MS = 60 * 30 * 1000 // 30 min absolute (matches admin plugin impersonationSessionDuration)

export interface OAuthCaller { userId: string, clientId: string, scopes: string[], isImpersonation: boolean, tokenRow: { id: string, referenceId: string | null } }

/** Resolve & validate an `Authorization: Bearer <token>` against oauthAccessToken (plaintext-opaque, matching the oauth-provider scheme). */
export async function requireOAuthToken(event: H3Event): Promise<OAuthCaller> {
  const header = getHeader(event, 'authorization') || ''
  if (!header.startsWith('Bearer '))
    throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })
  const token = header.slice(7).trim()
  const row = await db.query.oauthAccessToken.findFirst({ where: (t, { eq: e }) => e(t.token, token) })
  // Uniform 401 for missing/expired/invalid (no oracle — FM M3)
  if (!row || !row.userId || !row.clientId)
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' })
  if (row.expiresAt && row.expiresAt.getTime() < Date.now())
    throw createError({ statusCode: 401, statusMessage: 'Invalid token' })
  const scopes = Array.isArray(row.scopes) ? row.scopes as string[] : []
  return {
    userId: row.userId,
    clientId: row.clientId,
    scopes,
    isImpersonation: (row.referenceId ?? '').startsWith(IMP_PREFIX),
    tokenRow: { id: row.id, referenceId: row.referenceId ?? null },
  }
}

/** System admin = user.role === 'admin' OR id in adminUserIds. */
export async function isSystemAdmin(userId: string): Promise<boolean> {
  const adminIds = (useRuntimeConfig().adminUserIds || '').split(',').filter(Boolean)
  if (adminIds.includes(userId))
    return true
  const u = await db.query.user.findFirst({ where: (x, { eq: e }) => e(x.id, userId), columns: { role: true } })
  return u?.role === 'admin'
}

export interface Page<T> { items: T[], hasMore: boolean }
export interface Candidate { id: string, email: string, name: string | null, image: string | null }

/** Impersonatable users: everyone EXCEPT system admins and the caller (FM C3). */
export async function impersonatableUsersPage(selfId: string, q: string, limit: number, offset: number): Promise<Page<Candidate>> {
  const adminIds = (useRuntimeConfig().adminUserIds || '').split(',').filter(Boolean)
  const term = q ? `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%` : undefined
  const rows = await db.query.user.findMany({
    where: (x, { and: a, eq: e, ne: n, or: o }) => a(
      n(x.id, selfId),
      ne(x.role, 'admin'),                       // exclude role-admins
      term ? o(like(x.name, term), like(x.email, term)) : undefined,
    ),
    orderBy: (x, { asc }) => asc(x.email),
    limit: limit + 1,
    offset,
    columns: { id: true, email: true, name: true, image: true, role: true },
  })
  const filtered = rows.filter(r => !adminIds.includes(r.id)) // also exclude adminUserIds-admins
  return { items: filtered.slice(0, limit).map(({ role: _r, ...rest }) => rest), hasMore: filtered.length > limit }
}

/** Mint a non-refreshable, short-lived access token acting as `targetUserId`, scoped to `clientId`. */
export async function mintImpersonationToken(adminId: string, targetUserId: string, clientId: string): Promise<{ token: string, id: string, expiresAt: Date }> {
  const token = randomToken(48)
  const id = `imptok-${randomToken(16)}`
  const expiresAt = new Date(Date.now() + IMP_TTL_MS)
  await db.insert(oauthAccessToken).values({
    id,
    token,
    clientId,
    userId: targetUserId,
    referenceId: `${IMP_PREFIX}${adminId}`, // marks impersonation + records the real actor
    refreshId: null,                         // NON-refreshable (FM C1)
    expiresAt,
    createdAt: new Date(),
    scopes: ['openid', 'profile', 'email'],
  })
  await db.insert(impersonationAudit).values({ id: `impa-${randomToken(16)}`, impersonatorId: adminId, targetId: targetUserId, clientId, action: 'start', tokenId: id, createdAt: new Date() })
  return { token, id, expiresAt }
}

export async function revokeImpersonationToken(caller: OAuthCaller): Promise<void> {
  await db.delete(oauthAccessToken).where(eq(oauthAccessToken.id, caller.tokenRow.id))
  const adminId = (caller.tokenRow.referenceId ?? '').slice(IMP_PREFIX.length)
  await db.insert(impersonationAudit).values({ id: `impa-${randomToken(16)}`, impersonatorId: adminId, targetId: caller.userId, clientId: caller.clientId, action: 'stop', tokenId: caller.tokenRow.id, createdAt: new Date() })
}
```

> Confirm `oauthAccessToken` and `user` are re-exported from `@nuxthub/db/schema`. The Phase-0 explore confirmed `oauthAccessToken` columns: `id, token, clientId, sessionId, userId, referenceId, refreshId, expiresAt, createdAt, scopes(json)`. `randomToken` is in `server/utils/nanoid.ts` (used by `access.ts`).

## Step 2.3 — Routes (file-based, override the `/api/auth/**` catch-all)

`server/api/auth/rp/impersonatable-users.get.ts`:

```ts
import { z } from 'zod'
import { impersonatableUsersPage, isSystemAdmin, requireOAuthToken } from '../../../services/rp'

const querySchema = z.object({ q: z.string().optional().default(''), limit: z.coerce.number().min(1).max(50).default(20), offset: z.coerce.number().min(0).default(0) })

export default defineEventHandler(async (event) => {
  const caller = await requireOAuthToken(event)
  if (caller.isImpersonation || !(await isSystemAdmin(caller.userId)))
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })
  const { q, limit, offset } = await getValidatedQuery(event, querySchema.parse)
  return impersonatableUsersPage(caller.userId, q, limit, offset)
})
```

`server/api/auth/rp/impersonate.post.ts`:

```ts
import { z } from 'zod'
import { claimsResolve, claimsResolveAll } from '../../../services/claims'
import { abilitiesForRole } from '#shared/permissions'
import { entitlementsResolve } from '../../../services/entitlements'
import { isSystemAdmin, mintImpersonationToken, requireOAuthToken } from '../../../services/rp'
import { db } from '@nuxthub/db'

const bodySchema = z.object({ userId: z.string().min(1) })

export default defineEventHandler(async (event) => {
  const caller = await requireOAuthToken(event)
  // FM C2: a caller whose own token is an impersonation token may NOT impersonate (no chaining)
  if (caller.isImpersonation)
    throw createError({ statusCode: 403, statusMessage: 'Cannot chain impersonation' })
  if (!(await isSystemAdmin(caller.userId)))
    throw createError({ statusCode: 403, statusMessage: 'Admin access required' })

  const { userId: targetId } = await readValidatedBody(event, bodySchema.parse)
  if (targetId === caller.userId)
    throw createError({ statusCode: 400, statusMessage: 'Cannot impersonate yourself' })
  // FM C3: target must not be a system admin
  if (await isSystemAdmin(targetId))
    throw createError({ statusCode: 403, statusMessage: 'Cannot impersonate an administrator' })
  const target = await db.query.user.findFirst({ where: (x, { eq }) => eq(x.id, targetId) })
  if (!target)
    throw createError({ statusCode: 404, statusMessage: 'User not found' })

  const minted = await mintImpersonationToken(caller.userId, targetId, caller.clientId)
  const [claims, organizations, entitlement] = await Promise.all([
    claimsResolve(targetId, caller.clientId),
    claimsResolveAll(targetId, caller.clientId),
    entitlementsResolve(targetId, caller.clientId),
  ])
  return {
    accessToken: minted.token,
    expiresAt: minted.expiresAt.getTime(),
    user: { sub: target.id, email: target.email, name: target.name, picture: (target as { image?: string | null }).image ?? null, email_verified: true },
    claims: { ...claims, organizations, abilities: abilitiesForRole(claims.roles), role: null, entitlement },
  }
})
```

`server/api/auth/rp/stop-impersonating.post.ts`:

```ts
import { requireOAuthToken, revokeImpersonationToken } from '../../../services/rp'

export default defineEventHandler(async (event) => {
  const caller = await requireOAuthToken(event)
  if (!caller.isImpersonation)
    throw createError({ statusCode: 400, statusMessage: 'Not an impersonation token' })
  await revokeImpersonationToken(caller)
  return { ok: true }
})
```

## Step 2.4 — Extend the break-glass gate

Edit `server/middleware/impersonation.ts` to also gate the RP impersonate route:

```ts
export default defineEventHandler((event) => {
  const path = event.path || ''
  const guarded = path.startsWith('/api/auth/admin/impersonate-user')
    || path.startsWith('/api/auth/rp/impersonate')
  if (!guarded)
    return
  const allowImpersonation = (useRuntimeConfig().allowImpersonation as string) === 'true'
  if (import.meta.dev || allowImpersonation)
    return
  throw createError({ statusCode: 403, statusMessage: 'Impersonation is disabled in production. Break-glass: set NUXT_ALLOW_IMPERSONATION=true on the Worker.' })
})
```

> Don't match `/stop-impersonating` — stopping must always be allowed.

## Step 2.5 — Log hygiene (FM H5)

Audit any `console.log`/observability you add in this phase: never log `Authorization`, the raw bearer token, or `Set-Cookie`. The services above log only ids on error.

---

## Verification — `examples/rp-proof.mjs` (new)

Mirror `sso-proof.mjs`'s flow to obtain an access token for a known admin and a non-admin (the seed creates demo users; reuse `examples/.clients.json`). Then assert:

1. `GET /api/auth/rp/impersonatable-users` with a **non-admin** token → 403.
2. Same with an **admin** token → 200, list **excludes** admins and self.
3. `POST /api/auth/rp/impersonate {userId: <admin>}` → 403 (target admin).
4. `POST /api/auth/rp/impersonate {userId: <member>}` → 200, returns `accessToken` + `claims.organizations`.
5. Use the impersonation token to call `/rp/impersonate` again → 403 (no chaining).
6. The impersonation token has no refresh path: `POST /oauth2/token grant_type=refresh_token` is impossible (no refresh token issued).
7. `POST /api/auth/rp/stop-impersonating` with the impersonation token → `{ok:true}`; the token no longer authorizes.

```bash
pnpm dev
curl -X POST http://localhost:3000/_nitro/tasks/seed:idp
node examples/rp-proof.mjs
pnpm lint && pnpm exec nuxi typecheck
```

## Acceptance
- [ ] `impersonationAudit` table exists; start/stop rows written.
- [ ] All 7 rp-proof assertions pass; lint + typecheck = 0.
- [ ] No token/secret/cookie appears in logs.
