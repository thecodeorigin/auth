# Phase 02 — Services + Nord reseed + cleanup hooks

Backend logic + seed data, all offline. After this phase, signing in as
`alice@seed.local` and querying D1 shows the full Nord subscription set; no Polar
yet. Services live in `server/services/` (auto-imported via
`nitro.imports.dirs`). Adapter/`db` patterns mirror `access.ts` + `org.ts`.

## Step 2.1 — `server/services/subscription.ts`

```ts
import { db } from '@nuxthub/db'
import { subscription, subscriptionMember } from '../db/schema/billing'
import { isActive, type SubscriptionRow } from '#shared/subscription'
import { planBySlug } from '#shared/catalog'
import { eq, and, sql } from 'drizzle-orm'

function rid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

/** All subscriptions a user OWNS (referenceId model is userId-only). */
export async function subscriptionListForUser(userId: string): Promise<SubscriptionRow[]> {
  const rows = await db.select().from(subscription).where(eq(subscription.userId, userId))
  return rows.map(toRow).sort((a, b) => statusRank(a) - statusRank(b) || (b.createdAt - a.createdAt))
}

export async function subscriptionGet(id: string): Promise<SubscriptionRow | null> {
  const [row] = await db.select().from(subscription).where(eq(subscription.id, id)).limit(1)
  return row ? toRow(row) : null
}

/**
 * Cancel a subscription the caller owns.
 * - Polar-backed (has polarSubscriptionId): defer to Polar via the portal in the
 *   UI; this local route only flips cancelAtPeriodEnd so the dashboard reflects intent.
 *   (Authoritative cancel + refund flows happen in the Polar portal / webhook.)
 * - Seeded (source='seed', null polarSubscriptionId): LOCAL-ONLY — never touch Polar.
 */
export async function subscriptionSetCancelAtPeriodEnd(id: string, cancel: boolean): Promise<void> {
  await db.update(subscription)
    .set({ cancelAtPeriodEnd: cancel, updatedAt: new Date() })
    .where(eq(subscription.id, id))
}

/** Idempotent upsert used by BOTH the seed task and the Polar webhook. */
export async function subscriptionUpsert(input: {
  id?: string
  userId: string
  planSlug: string
  status: SubscriptionRow['status']
  currentPeriodEnd: number | null
  cancelAtPeriodEnd?: boolean
  source: SubscriptionRow['source']
  polarSubscriptionId?: string | null
  polarCustomerId?: string | null
  updatedAt?: number
}): Promise<void> {
  const now = new Date()
  const updatedAt = new Date(input.updatedAt ?? now.getTime())
  // Deterministic id for seed idempotency: seed rows key on (userId, planSlug).
  const id = input.id
    ?? (input.source === 'seed' ? `sub-seed-${input.userId}-${input.planSlug}` : rid('sub'))

  await db.insert(subscription)
    .values({
      id,
      userId: input.userId,
      planSlug: input.planSlug,
      status: input.status,
      currentPeriodEnd: input.currentPeriodEnd == null ? null : new Date(input.currentPeriodEnd),
      cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
      source: input.source,
      polarSubscriptionId: input.polarSubscriptionId ?? null,
      polarCustomerId: input.polarCustomerId ?? null,
      createdAt: now,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: subscription.id,
      set: {
        status: input.status,
        currentPeriodEnd: input.currentPeriodEnd == null ? null : new Date(input.currentPeriodEnd),
        cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
        polarSubscriptionId: input.polarSubscriptionId ?? null,
        polarCustomerId: input.polarCustomerId ?? null,
        updatedAt,
      },
      // STALENESS GUARD: drop out-of-order webhooks (older updatedAt loses).
      setWhere: sql`${subscription.updatedAt} < ${updatedAt.getTime()}`,
    })
}

/**
 * Webhook entry point. Maps a Polar subscription object → local row, keyed on the
 * UNIQUE polarSubscriptionId. referenceId/userId/planSlug are read from the Polar
 * subscription's metadata (set at checkout) and customer.externalId — never guessed.
 */
export async function subscriptionUpsertFromPolar(sub: {
  id: string
  status: string
  current_period_end?: string | null
  cancel_at_period_end?: boolean
  modified_at?: string | null
  product_id: string
  customer?: { external_id?: string | null, id?: string | null } | null
  metadata?: Record<string, unknown> | null
}): Promise<void> {
  const { polarPlanSlugForProduct } = await import('./polar-products')
  const userId = (sub.metadata?.userId as string | undefined) ?? sub.customer?.external_id ?? null
  const planSlug = (sub.metadata?.planSlug as string | undefined) ?? polarPlanSlugForProduct(sub.product_id)
  if (!userId || !planSlug) {
    console.warn('[billing] webhook: cannot resolve userId/planSlug', sub.id, { userId, planSlug })
    return
  }
  // Find an existing local row by polarSubscriptionId to reuse its id (upsert in place).
  const [existing] = await db.select({ id: subscription.id }).from(subscription)
    .where(eq(subscription.polarSubscriptionId, sub.id)).limit(1)

  const status = mapPolarStatus(sub.status, sub.current_period_end)
  await subscriptionUpsert({
    id: existing?.id, // undefined → new rid('sub')
    userId,
    planSlug,
    status,
    currentPeriodEnd: sub.current_period_end ? Date.parse(sub.current_period_end) : null,
    cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    source: 'polar',
    polarSubscriptionId: sub.id,
    polarCustomerId: sub.customer?.id ?? null,
    updatedAt: sub.modified_at ? Date.parse(sub.modified_at) : Date.now(),
  })
}

function mapPolarStatus(s: string, periodEnd?: string | null): SubscriptionRow['status'] {
  switch (s) {
    case 'active': return periodEnd && Date.parse(periodEnd) <= Date.now() ? 'expired' : 'active'
    case 'trialing': return 'trialing'
    case 'past_due': case 'unpaid': return 'past_due'
    case 'canceled': case 'revoked': return 'canceled'
    default: return 'expired'
  }
}

/** D1 has no FK cascade at runtime — called from the user.delete hook. */
export async function subscriptionClearForUser(userId: string): Promise<void> {
  const subs = await db.select({ id: subscription.id }).from(subscription).where(eq(subscription.userId, userId))
  for (const s of subs)
    await db.delete(subscriptionMember).where(eq(subscriptionMember.subscriptionId, s.id))
  await db.delete(subscription).where(eq(subscription.userId, userId))
  // Also drop any seat rows where this user was an invitee on someone else's plan.
  await db.delete(subscriptionMember).where(eq(subscriptionMember.userId, userId))
}

function statusRank(s: SubscriptionRow): number {
  return isActive(s) ? 0 : 1 // active first
}

function toRow(r: typeof subscription.$inferSelect): SubscriptionRow {
  return {
    id: r.id,
    userId: r.userId,
    planSlug: r.planSlug,
    status: r.status as SubscriptionRow['status'],
    currentPeriodEnd: r.currentPeriodEnd ? r.currentPeriodEnd.getTime() : null,
    cancelAtPeriodEnd: !!r.cancelAtPeriodEnd,
    source: r.source as SubscriptionRow['source'],
    polarSubscriptionId: r.polarSubscriptionId,
    polarCustomerId: r.polarCustomerId,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  }
}
```

> **Drizzle note:** verify `onConflictDoUpdate` supports `setWhere` in the
> installed drizzle version. If not, replace the guard with a pre-read +
> conditional `update().where(and(eq(id), lt(updatedAt, x)))` (same effect). The
> existing `access.ts` upsert pattern is the reference for the supported API.
> **crypto.randomUUID** is available in Workers/Nitro global scope.

## Step 2.2 — `server/services/family.ts`

```ts
import { db } from '@nuxthub/db'
import { subscription, subscriptionMember } from '../db/schema/billing'
import { planBySlug } from '#shared/catalog'
import type { FamilyMemberStatus } from '#shared/subscription'
import { and, eq, sql } from 'drizzle-orm'

export interface FamilyMember {
  id: string
  email: string
  userId: string | null
  status: FamilyMemberStatus
  createdAt: number
}

export async function familyMembers(subscriptionId: string): Promise<FamilyMember[]> {
  const rows = await db.select().from(subscriptionMember)
    .where(eq(subscriptionMember.subscriptionId, subscriptionId))
  return rows
    .map(r => ({ id: r.id, email: r.email, userId: r.userId, status: r.status as FamilyMemberStatus, createdAt: r.createdAt.getTime() }))
    .sort((a, b) => (a.status === 'owner' ? -1 : b.status === 'owner' ? 1 : a.createdAt - b.createdAt))
}

/**
 * Add a seat. Caller MUST already be verified as the subscription owner (route does this).
 * Seat cap enforced by a count-gated conditional insert — no TOCTOU. If a verified
 * user with this email exists, bind userId + status 'member'; else 'invited'.
 * Returns 'added' | 'full' | 'duplicate'.
 */
export async function familyAddMember(subscriptionId: string, planSlug: string, email: string): Promise<'added' | 'full' | 'duplicate'> {
  const seats = planBySlug(planSlug)?.seats ?? 1
  const normEmail = email.trim().toLowerCase()

  // Duplicate guard (UNIQUE also enforces this at the DB level).
  const [dupe] = await db.select({ id: subscriptionMember.id }).from(subscriptionMember)
    .where(and(eq(subscriptionMember.subscriptionId, subscriptionId), eq(subscriptionMember.email, normEmail))).limit(1)
  if (dupe)
    return 'duplicate'

  // Resolve an existing user by email (verified accounts only become 'member').
  const existingUser = await db.query.user.findFirst({ where: (u, { eq: e }) => e(u.email, normEmail) })

  // Conditional insert: only succeeds while seat count < cap. INSERT...SELECT is
  // evaluated atomically per statement in SQLite/D1 → no count-then-insert race.
  const id = `fam-${crypto.randomUUID()}`
  const status: FamilyMemberStatus = existingUser ? 'member' : 'invited'
  const res = await db.run(sql`
    INSERT INTO subscriptionMember (id, subscriptionId, email, userId, status, createdAt)
    SELECT ${id}, ${subscriptionId}, ${normEmail}, ${existingUser?.id ?? null}, ${status},
           (cast(unixepoch('subsecond') * 1000 as integer))
    WHERE (SELECT count(*) FROM subscriptionMember WHERE subscriptionId = ${subscriptionId}) < ${seats}
  `)
  // d1/libsql expose rowsAffected on the run result.
  const affected = (res as { rowsAffected?: number, changes?: number }).rowsAffected
    ?? (res as { changes?: number }).changes ?? 0
  return affected > 0 ? 'added' : 'full'
}

export async function familyRemoveMember(subscriptionId: string, memberId: string): Promise<boolean> {
  // Never allow removing the owner row.
  const [m] = await db.select().from(subscriptionMember)
    .where(and(eq(subscriptionMember.id, memberId), eq(subscriptionMember.subscriptionId, subscriptionId))).limit(1)
  if (!m || m.status === 'owner')
    return false
  await db.delete(subscriptionMember).where(eq(subscriptionMember.id, memberId))
  return true
}

/** Seed helper: upsert the owner seat for a subscription. */
export async function familyEnsureOwner(subscriptionId: string, email: string, userId: string): Promise<void> {
  await db.insert(subscriptionMember)
    .values({ id: `fam-owner-${subscriptionId}`, subscriptionId, email: email.toLowerCase(), userId, status: 'owner', createdAt: new Date() })
    .onConflictDoNothing()
}
```

> `db.query.user.findFirst` requires the better-auth relational schema (already
> used by `claims.ts` via `db.query.member`). If `db.run(sql\`…\`)` is not
> exposed by the `@nuxthub/db` wrapper, use the drizzle `db.insert(...).select?`
> builder; the **acceptance is the atomic count-gated insert**, not the exact API.
> Cook: confirm the raw-SQL escape hatch on `db` (search how other services run
> raw SQL, if any) and adjust — but keep the single-statement cap check.

## Step 2.3 — `server/services/entitlements.ts` (used in Phase 04, defined here)

```ts
import { db } from '@nuxthub/db'
import { subscription } from '../db/schema/billing'
import { isActive } from '#shared/subscription'
import { planBySlug, productByClientName } from '#shared/catalog'
import { eq } from 'drizzle-orm'

export interface Entitlement {
  product: string // product slug
  plan: string // plan slug
  status: string
  active: boolean
  currentPeriodEnd: number | null
}

/**
 * Resolve the REQUESTING client's product entitlement for a user, live (per userinfo call).
 * clientId → oauthClient.name → catalog product → user's newest subscription for that product.
 * Returns null when the requesting client maps to no catalog product, or the user owns nothing.
 */
export async function entitlementsResolve(userId: string, clientId?: string | null): Promise<Entitlement | null> {
  if (!clientId)
    return null
  try {
    const client = await db.query.oauthClient.findFirst({ where: (c, { eq: e }) => e(c.clientId, clientId) })
    if (!client?.name)
      return null
    const product = productByClientName(client.name)
    if (!product)
      return null

    const subs = await db.select().from(subscription).where(eq(subscription.userId, userId))
    const owned = subs
      .map(s => ({ s, plan: planBySlug(s.planSlug) }))
      .filter(x => x.plan?.productSlug === product.slug)
      .sort((a, b) => b.s.createdAt.getTime() - a.s.createdAt.getTime())
    const top = owned[0]
    if (!top)
      return null

    const cpe = top.s.currentPeriodEnd ? top.s.currentPeriodEnd.getTime() : null
    return {
      product: product.slug,
      plan: top.s.planSlug,
      status: top.s.status,
      active: isActive({ status: top.s.status as never, currentPeriodEnd: cpe }),
      currentPeriodEnd: cpe,
    }
  }
  catch (error) {
    console.error('[billing] entitlementsResolve failed', userId, clientId, error)
    return null
  }
}
```

> `db.query.oauthClient` relational accessor: confirm the generated relational
> schema exposes `oauthClient` (the better-auth oauth-provider plugin table). If
> the relational name differs, fall back to a plain
> `db.select().from(oauthClient).where(eq(clientId, …))` importing the generated
> table. (claims.ts uses `db.query.member` so the relational API is available.)

## Step 2.4 — rename demo clients to Nord products (`server/tasks/seed/idp.ts`)

Replace the `DEMO_CLIENTS` const (lines 11–16):

```ts
const DEMO_CLIENTS = [
  { name: 'NordVPN', redirectUris: ['http://localhost:3001/callback'], public: false },
  { name: 'NordPass', redirectUris: ['http://localhost:3002/api/auth/callback/betterauth', 'chrome-extension://eiaeiblijfjekdanodkjadfinkhbfgcd/app.html'], public: false },
  { name: 'NordLocker', redirectUris: ['http://localhost:3003/auth/oidc/callback'], public: false },
  { name: 'Nord Web', redirectUris: ['http://localhost:3004/callback'], public: true },
]
```

> Redirect URIs keep the existing localhost ports so the RP example apps still
> work. The NordPass extension callback from `requirement.md` is added as a
> second URI (must be `http(s)://` OR a `chrome-extension://` — confirm the Zod
> `redirectUri` validator in `clientCreate`/the patch route allows the
> `chrome-extension://` scheme; **if it rejects non-http(s)**, drop that URI from
> the seed and note it (CLAUDE.md hard rule #9 restricts to `http(s)://`). Safer
> default: **omit the chrome-extension URI** unless the validator is widened
> deliberately.) → **Decision: omit it**; keep only the http localhost URI to
> respect hard rule #9. Use:
> `{ name: 'NordPass', redirectUris: ['http://localhost:3002/api/auth/callback/betterauth'], public: false }`.

No other change to `idp.ts` — it already deletes-by-name then recreates, so the
rename is clean and `examples/.clients.json` is rewritten with the new names.

## Step 2.5 — `server/tasks/seed/authz-fixtures.ts` rename reference

Find the line that picks the Express RP client (the fixture grants alice access
to that confidential client) and change the name:

```ts
// before: const express = ... byName/where name 'Express RP'
// after:
const nordvpn = await adapter.findOne<{ clientId: string }>({ model: 'oauthClient', where: [{ field: 'name', value: 'NordVPN' }] })
// ...use nordvpn.clientId where 'Express RP' clientId was used (the tier-0 grant).
```

Keep the returned fixture keys (`orgB`, `personalOrg`) unchanged — `authz-proof`
depends on them. Only the client the grant targets is renamed.

## Step 2.6 — `server/tasks/seed/subscriptions.ts` (new — `seed:subscriptions`)

```ts
import { subscriptionUpsert } from '../../services/subscription'
import { familyEnsureOwner, familyAddMember } from '../../services/family'

// Today = 2026-06-14. Dates chosen to match the Nord Account screenshots.
const DEC_14_2023 = Date.parse('2023-12-14T00:00:00Z')
const OCT_03_2027 = Date.parse('2027-10-03T00:00:00Z')
const SEP_14_2027 = Date.parse('2027-09-14T00:00:00Z')

// Who sees the simulated platform: the member persona AND the operator login.
const DEMO_EMAILS = ['alice@seed.local', 'admin@thecodeorigin.com']

// (planSlug, status, currentPeriodEnd) — matches the dashboard screenshot exactly.
const DEMO_SUBS: Array<{ planSlug: string, status: 'active' | 'expired', end: number | null }> = [
  { planSlug: 'nordvpn-complete', status: 'expired', end: DEC_14_2023 },
  { planSlug: 'dark-web-monitor', status: 'expired', end: DEC_14_2023 },
  { planSlug: 'nordpass-premium', status: 'active', end: OCT_03_2027 },
  { planSlug: 'nordpass-family', status: 'active', end: SEP_14_2027 },
  { planSlug: 'nordlocker-free', status: 'active', end: null },
]

const FAMILY_MEMBER_EMAILS = [
  'hao100319@gmail.com', 'quangtudng@gmail.com', 'longnt189@gmail.com',
  'datntt98@gmail.com', 'minhpt2002@gmail.com',
]

export default defineTask({
  meta: { name: 'seed:subscriptions', description: 'Seed Nord product subscriptions + NordPass Family seats for demo users' },
  async run() {
    const auth = serverAuth()
    const ctx = await auth.$context
    const adapter = ctx.adapter

    const out: Record<string, unknown> = {}
    for (const email of DEMO_EMAILS) {
      const u = await adapter.findOne<{ id: string }>({ model: 'user', where: [{ field: 'email', value: email }] })
      if (!u) {
        out[email] = 'skipped (user not found — run seed:idp first)'
        continue
      }
      for (const s of DEMO_SUBS) {
        await subscriptionUpsert({ userId: u.id, planSlug: s.planSlug, status: s.status, currentPeriodEnd: s.end, source: 'seed' })
      }
      // NordPass Family: owner seat + 5 members = 6/6.
      const familyId = `sub-seed-${u.id}-nordpass-family`
      await familyEnsureOwner(familyId, email, u.id)
      for (const m of FAMILY_MEMBER_EMAILS)
        await familyAddMember(familyId, 'nordpass-family', m)
      out[email] = 'seeded'
    }
    return { result: 'ok', users: out }
  },
})
```

> `subscriptionUpsert` with `source:'seed'` derives the deterministic id
> `sub-seed-{userId}-{planSlug}`, so `familyId` above matches the
> nordpass-family row's id. Idempotent: re-running updates in place; family
> adds are `duplicate` no-ops after the first run.

## Step 2.7 — user-delete cleanup hook (`server/auth.config.ts`)

The codebase has **no** user-delete hook today (failure-mode finding #7). Add one
in `databaseHooks` next to the existing `session` hook:

```ts
databaseHooks: {
  session: { /* …unchanged… */ },
  user: {
    // better-auth admin deleteUser → clean up D1 rows (no FK cascade at runtime).
    delete: {
      before: async (user) => {
        try {
          await subscriptionClearForUser(user.id)
        }
        catch (error) {
          console.error('[auth] subscriptionClearForUser failed', user.id, error)
        }
      },
    },
  },
},
```

Add the import at the top: `import { subscriptionClearForUser } from './services/subscription'`.

> **Verify the hook shape**: confirm better-auth exposes `databaseHooks.user.delete.before`
> in this version (1.6.16). If the exact path differs (e.g. `user.delete.after`
> or no user hook), fall back to clearing in a custom admin delete wrapper, OR
> document it as a known gap. Search the better-auth types for `databaseHooks`.

## Verify (Phase 02 done)

```bash
pnpm exec nuxi typecheck       # 0
# dev running:
curl -X POST http://localhost:3000/_nitro/tasks/seed:idp           # clients now NordVPN/NordPass/...
curl -X POST http://localhost:3000/_nitro/tasks/seed:subscriptions # → result ok, both users 'seeded'
node examples/sso-proof.mjs    # green (renamed clients, PKCE still enforced)
node examples/authz-proof.mjs  # green (NordVPN tier-0 wins) — after Step 2.5
```
Confirm in D1: 5 `subscription` rows per demo user; 6 `subscriptionMember` rows
(1 owner + 5 members) on each user's `nordpass-family` subscription.
