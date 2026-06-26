# Phase 5 — Proxy routes (orgs / switch / impersonation) + refresh helper

**Repo:** `D:\projects\better-auth\packages\auth`
**Goal:** Implement the `_auth` server routes that back `useAuth()`'s methods, plus the server-side single-flight token refresh.

**Depends on:** Phase 2 (IdP `/rp/*` live), Phase 4.

---

## Step 5.1 — `idp.ts`: authenticated IdP fetch with refresh (FM H1/C1/M1)

`src/runtime/server/utils/idp.ts`:

```ts
import type { H3Event } from 'h3'
import type { SessionRecord } from './session'
import { resolveAuthConfig } from './oidc'
import { writeSessionRecord } from './session'

const SKEW_MS = 60_000 // M1 clock-skew buffer

async function refresh(cfg: ReturnType<typeof resolveAuthConfig>, rec: SessionRecord): Promise<boolean> {
  if (rec.isImpersonation || !rec.refreshToken) return false // C1: impersonation tokens never refresh
  try {
    const t = await $fetch<{ access_token: string, refresh_token?: string, expires_in?: number }>(`${cfg.issuer}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}` },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rec.refreshToken }).toString(),
    })
    rec.accessToken = t.access_token
    rec.refreshToken = t.refresh_token ?? rec.refreshToken
    rec.accessExpiresAt = Date.now() + (t.expires_in ?? 3600) * 1000
    return true
  } catch { return false }
}

/**
 * Call an IdP path with the session's bearer token. Refreshes once (single-flight per
 * record via re-read) on expiry/401. Persists the rotated record. Returns parsed JSON.
 */
export async function idpFetch<T>(event: H3Event, id: string, rec: SessionRecord, path: string, opts: { method?: string, body?: any, query?: any } = {}): Promise<T> {
  const cfg = resolveAuthConfig()
  // Proactive refresh with skew buffer.
  if (!rec.isImpersonation && Date.now() > rec.accessExpiresAt - SKEW_MS) {
    if (await refresh(cfg, rec)) await writeSessionRecord(id, rec)
  }
  const call = () => $fetch<T>(`${cfg.issuer}${path}`, { method: opts.method as any, body: opts.body, query: opts.query, headers: { Authorization: `Bearer ${rec.accessToken}` } })
  try { return await call() }
  catch (e: any) {
    if (e?.response?.status !== 401) throw e
    // H1: another request may have rotated already — re-read freshest record first.
    const { readSessionRecordById } = await import('./session')
    const fresh = await readSessionRecordById(id)
    if (fresh && fresh.accessToken !== rec.accessToken) { Object.assign(rec, fresh); return call() }
    if (await refresh(cfg, rec)) { await writeSessionRecord(id, rec); return call() }
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }
}
```

Add `readSessionRecordById(id)` to `session.ts`:

```ts
export async function readSessionRecordById(id: string): Promise<SessionRecord | null> {
  const cfg = resolveAuthConfig(); return store(cfg.storageBase).getItem<SessionRecord>(key(id))
}
```

> True cross-request single-flight needs a lock (KV/DO). For v1 the re-read-before-refresh pattern above tolerates the common rotation race (FM H1). If forced logouts appear under load, add a per-id lock via a short-lived `lock:<id>` KV key with a spin — note it as a follow-up, don't build speculatively.

## Step 5.2 — Orgs (no IdP call) + switch

`src/runtime/server/api/_auth/organizations.get.ts`:

```ts
import { readSessionRecord } from '../../utils/session'
export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return s.rec.organizations // cached from userinfo; per-client scoped
})
```

`src/runtime/server/api/_auth/organizations/switch.post.ts`:

```ts
import { z } from 'zod'
import { abilitiesFromOrg } from '../../../utils/abilities'
import { readSessionRecord, toPublicSession, writeSessionRecord } from '../../../utils/session'

const bodySchema = z.object({ organizationId: z.string() })
export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  const { organizationId } = await readValidatedBody(event, bodySchema.parse)
  const org = s.rec.organizations.find(o => o.id === organizationId)
  if (!org) throw createError({ statusCode: 403, statusMessage: 'Not a member of that organization' })
  s.rec.activeOrg = org.id
  s.rec.abilities = abilitiesFromOrg(org.role)   // cosmetic only — server endpoints are authority (FM M4)
  await writeSessionRecord(s.id, s.rec)
  return toPublicSession(s.rec)
})
```

`src/runtime/server/utils/abilities.ts`:

```ts
// Mirror the IdP's role→ability statement so switching active org re-derives abilities
// without an IdP round-trip. Keep in sync with the IdP #shared/permissions statement.
const STATEMENT: Record<string, readonly string[]> = {
  owner: ['project:create', 'project:read', 'project:update', 'project:delete', 'member:create', 'member:update', 'member:delete', 'role:create', 'role:update', 'role:delete'],
  admin: ['project:create', 'project:read', 'project:update', 'member:create', 'member:update', 'role:create', 'role:update', 'role:delete'],
  member: ['project:read'],
}
export function abilitiesFromOrg(role: string): string[] { return [...(STATEMENT[role] ?? [])] }
```

> This is the ONE place the module mirrors the IdP catalog (only for the local switch convenience). It's cosmetic — the IdP re-authorizes on every `/rp/*` and business call. If drift is a concern, switchOrganization can instead re-fetch userinfo via `idpFetch` (slower); default to the local mirror for v1 and document the tradeoff.

## Step 5.3 — Impersonation proxies (with backup/restore)

`src/runtime/server/api/_auth/impersonatable-users.get.ts`:

```ts
import { idpFetch } from '../../utils/idp'
import { readSessionRecord } from '../../utils/session'
export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  return idpFetch(event, s.id, s.rec, '/api/auth/rp/impersonatable-users', { query: getQuery(event) })
})
```

`src/runtime/server/api/_auth/impersonate.post.ts`:

```ts
import { z } from 'zod'
import { idpFetch } from '../../utils/idp'
import { newSessionId, readSessionRecord, toPublicSession, writeSessionRecord } from '../../utils/session'

const bodySchema = z.object({ userId: z.string() })
export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  if (s.rec.isImpersonation) throw createError({ statusCode: 400, statusMessage: 'Already impersonating' })
  const { userId } = await readValidatedBody(event, bodySchema.parse)

  const res = await idpFetch<{ accessToken: string, expiresAt: number, user: any, claims: any }>(event, s.id, s.rec, '/api/auth/rp/impersonate', { method: 'POST', body: { userId } })

  // Back up the admin's record under a new id (H2: backup stays server-side, not in cookie).
  const backupId = newSessionId()
  await writeSessionRecord(backupId, { ...s.rec, isImpersonation: false })

  // Reuse the SAME cookie/session id; overwrite its record to act as the target.
  s.rec = {
    sub: res.user.sub,
    user: { sub: res.user.sub, email: res.user.email, name: res.user.name ?? null, picture: res.user.picture ?? null },
    abilities: res.claims.abilities, systemRole: null,
    organizations: res.claims.organizations, activeOrg: res.claims.org, entitlement: res.claims.entitlement,
    accessToken: res.accessToken, refreshToken: null, accessExpiresAt: res.expiresAt,
    isImpersonation: true,
    impersonator: { sub: s.rec.user.sub, email: s.rec.user.email, name: s.rec.user.name, picture: s.rec.user.picture },
    backupId,
  }
  await writeSessionRecord(s.id, s.rec)
  return toPublicSession(s.rec)
})
```

`src/runtime/server/api/_auth/stop-impersonating.post.ts`:

```ts
import { idpFetch } from '../../utils/idp'
import { readSessionRecord, readSessionRecordById, toPublicSession, writeSessionRecord } from '../../utils/session'
import { resolveAuthConfig } from '../../utils/oidc'

export default defineEventHandler(async (event) => {
  const s = await readSessionRecord(event)
  if (!s || !s.rec.isImpersonation) throw createError({ statusCode: 400, statusMessage: 'Not impersonating' })
  try { await idpFetch(event, s.id, s.rec, '/api/auth/rp/stop-impersonating', { method: 'POST' }) } catch {} // revoke best-effort
  const backup = s.rec.backupId ? await readSessionRecordById(s.rec.backupId) : null
  if (!backup) throw createError({ statusCode: 500, statusMessage: 'Original session missing — sign in again' })
  await writeSessionRecord(s.id, backup)
  // delete the backup copy
  const cfg = resolveAuthConfig(); await useStorage(cfg.storageBase).removeItem(`session:${s.rec.backupId}`)
  return toPublicSession(backup)
})
```

---

## Verification
- Against the dev IdP (Phase 2 live + Phase 6 client): in the playground, sign in as an admin → `getImpersonatableUsers()` lists members (no admins) → `impersonate(memberId)` flips `useAuth().user` to the member, `isImpersonating` true, `impersonator` = admin → `stopImpersonating()` restores the admin.
- Let an access token expire (short `expires_in` on a test client) and confirm a subsequent `getImpersonatableUsers()` triggers a refresh and succeeds; impersonation token expiry forces a clean failure → stop.

## Acceptance
- [ ] `getOrganizations` returns cached per-client list with no IdP call; `switchOrganization` updates active org + abilities.
- [ ] Impersonate/stop round-trip works; backup stored server-side (never in the cookie); impersonation token non-refreshable.
- [ ] `idpFetch` refreshes once on expiry/401 and tolerates the rotation race.
