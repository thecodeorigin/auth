# Phase 02 — Server resolution & storage

**Deliverables:**
1. `server/services/abilities.ts` — defensive metadata parse, `readAbilities`, and
   `abilitiesResolve` (mirrors `entitlementsResolve`).
2. `server/services/client.ts` — `clientGet` returns the map; `clientUpdate` accepts an
   `abilities` patch and **re-pins `metadata.clientId`** (R1).
3. `server/auth.config.ts` — `customUserInfoClaims` merges the resolved `abilities` (R6).

Depends on Phase 01.

---

## Step 2.1 — Create `server/services/abilities.ts`

```ts
// server/services/abilities.ts
import type { AbilityMap, AbilityRule } from '#shared/abilities'
import { db } from '@nuxthub/db'
import { abilityMapSchema } from '#shared/abilities'

/**
 * Parse a metadata literal that may be an object, JSON, or double/triple-encoded JSON
 * (the better-auth adapter is inconsistent — same disease handled by parseStringArray in
 * client.ts and orgParseMeta in org.ts). Returns a plain object or {}.
 */
export function parseMetadata(raw: unknown): Record<string, unknown> {
  let v: unknown = raw
  for (let depth = 0; depth < 3 && typeof v === 'string'; depth++) {
    try { v = JSON.parse(v) }
    catch { return {} }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
}

/** Read + validate the ability map out of a client's metadata. Invalid → {} (default-closed). */
export function readAbilities(metadata: unknown): AbilityMap {
  const meta = parseMetadata(metadata)
  const parsed = abilityMapSchema.safeParse(meta.abilities)
  return parsed.success ? parsed.data : {}
}

/** Whitelisted placeholder tokens → resolver. Returns null when the value resolves empty. */
const TOKENS: Record<string, (ctx: { userId: string }) => string | null> = {
  '${user.id}': ctx => ctx.userId || null,
}

function resolveValue(value: string, ctx: { userId: string }): string | null {
  if (Object.hasOwn(TOKENS, value))
    return TOKENS[value]!(ctx)
  // Schema already blocks foreign `${…}`; this is belt-and-suspenders.
  return value.includes('${') ? null : value
}

/**
 * Resolve a client's CASL rules for a SERVER-RESOLVED role. Mirrors entitlementsResolve.
 *
 * DEFAULT-CLOSED: returns [] when clientId/roleName is null/absent, the client is missing,
 * or the role has no own entry. A rule whose condition placeholder resolves empty is DROPPED.
 *
 * SECURITY: `roleName` MUST come from claimsResolve (server-resolved). Never pass a value
 * derived from an authorize param / scope / request input — that would be attacker-controlled.
 */
export async function abilitiesResolve(
  userId: string,
  clientId: string | null | undefined,
  roleName: string | null,
): Promise<AbilityRule[]> {
  if (!clientId || !roleName)
    return []
  try {
    const client = await db.query.oauthClient.findFirst({ where: (c, { eq }) => eq(c.clientId, clientId) })
    if (!client)
      return []
    const map = readAbilities(client.metadata)
    if (!Object.hasOwn(map, roleName))
      return []
    const rules = map[roleName]
    if (!Array.isArray(rules))
      return []

    const out: AbilityRule[] = []
    for (const rule of rules) {
      if (!rule.conditions) {
        out.push({ action: rule.action, subject: rule.subject })
        continue
      }
      const conditions: Record<string, string> = Object.create(null)
      let ok = true
      for (const [k, v] of Object.entries(rule.conditions)) {
        const resolved = resolveValue(v, { userId })
        if (resolved === null) { ok = false; break } // default-closed: never emit a blank scope
        conditions[k] = resolved
      }
      if (ok)
        out.push({ action: rule.action, subject: rule.subject, conditions })
    }
    return out
  }
  catch (error) {
    console.error('[auth] abilitiesResolve failed', userId, clientId, error)
    return []
  }
}
```

## Step 2.2 — Edit `server/services/client.ts`

**(a)** Add the import at the top (with the other imports):

```ts
import type { AbilityMap } from '#shared/abilities'
import { parseMetadata, readAbilities } from './abilities'
```

**(b)** Extend the patch + view types:

```ts
export interface ClientPatch {
  name?: string
  redirectUris?: string[]
  skipConsent?: boolean
  disabled?: boolean
  abilities?: AbilityMap // ← new
}

export interface ClientView {
  clientId: string
  name: string | null
  type: string | null
  public: boolean | null
  redirectUris: string[]
  skipConsent: boolean | null
  disabled: boolean | null
  createdAt: Date | null
  abilities: AbilityMap // ← new
}
```

**(c)** `clientGet` — read metadata and return abilities. Change the `findOne` type to include
metadata and add the field to the returned object:

```ts
export async function clientGet(adapter: ClientAdapter, clientId: string): Promise<ClientView | null> {
  const client = await adapter.findOne<ClientView & { metadata?: unknown }>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
  })
  if (!client)
    return null

  return {
    clientId: client.clientId,
    name: client.name,
    type: client.type,
    public: client.public,
    redirectUris: client.redirectUris,
    skipConsent: client.skipConsent,
    disabled: client.disabled,
    createdAt: client.createdAt,
    abilities: readAbilities(client.metadata), // ← new
  }
}
```

**(d)** `clientUpdate` — make `existing` carry metadata, and handle the `abilities` patch with
an **authoritative `clientId` re-pin** (R1). Replace the function body's top + branch list:

```ts
export async function clientUpdate(adapter: ClientAdapter, clientId: string, patch: ClientPatch): Promise<boolean> {
  const existing = await adapter.findOne<{ clientId: string, metadata?: unknown }>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
  })
  if (!existing)
    return false

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined)
    update.name = patch.name
  if (patch.redirectUris !== undefined)
    update.redirectUris = patch.redirectUris
  if (patch.skipConsent !== undefined)
    update.skipConsent = patch.skipConsent
  if (patch.disabled !== undefined)
    update.disabled = patch.disabled
  if (patch.abilities !== undefined) {
    const meta = parseMetadata(existing.metadata)
    // Re-pin clientId from the authoritative column — NEVER trust the merged blob (R1).
    update.metadata = { ...meta, clientId, abilities: patch.abilities }
  }

  await adapter.update({ model: 'oauthClient', where: [{ field: 'clientId', value: clientId }], update })
  return true
}
```

> **Why re-pin and not just merge:** `metadata.clientId` scopes every id_token
> (`customIdTokenClaims`, `auth.config.ts:134`). If a buggy/racing write or a stringified
> metadata read ever dropped it, the id_token would fall back to an arbitrary org/role
> (cross-app leak). Re-pinning makes that impossible. The adapter accepts an object for the
> json-mode `metadata` column (matches `clientCreate`'s `metadata: { clientId }`).

## Step 2.3 — Edit `server/auth.config.ts` (`customUserInfoClaims`)

Add the import alongside the existing service imports (where `entitlementsResolve` is imported):

```ts
import { abilitiesResolve } from './services/abilities'
```

Replace the body of `customUserInfoClaims` (currently lines ~141-150):

```ts
async customUserInfoClaims({ user, jwt }) {
  const clientId = (jwt as { azp?: string, client_id?: string } | undefined)?.azp
    ?? (jwt as { client_id?: string } | undefined)?.client_id ?? null
  // Resolve org/roles ONCE; derive abilities from the SAME snapshot (no TOCTOU — R6).
  const claims = await claimsResolve(user.id, clientId)
  const [entitlement, abilities] = await Promise.all([
    entitlementsResolve(user.id, clientId),
    abilitiesResolve(user.id, clientId, claims.roles),
  ])
  // entitlement is null when the client maps to no Nord product; abilities is [] default-closed.
  return { ...claims, entitlement, abilities }
}
```

> Leave `customIdTokenClaims` UNCHANGED — abilities ride into userinfo ONLY (live, revocable),
> matching the existing entitlement policy.

## Acceptance

- `pnpm exec nuxi typecheck` → 0.
- `pnpm lint` → 0.
- (Smoke, after Phase 05 seeds data) userinfo for a client with abilities returns a resolved
  `abilities` array; a client without returns `abilities: []`.
