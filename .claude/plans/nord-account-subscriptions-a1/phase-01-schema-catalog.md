# Phase 01 — Schema + static catalog + shared helpers

Two DB tables, one static typed catalog, one shared helper module, one
migration. No services or UI yet. Mirrors `server/db/schema/access.ts` exactly
(epoch-ms integer timestamps, deterministic ids, unique indexes).

## Step 1.1 — `server/db/schema/billing.ts`

```ts
import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '../../../.nuxt/better-auth/schema.sqlite'

const epochMs = () =>
  integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull()

/**
 * A user's entitlement to a catalog plan (plan metadata lives in shared/catalog.ts).
 * Local DB is the source of truth; Polar webhooks upsert here keyed on polarSubscriptionId.
 *   source 'seed' → never calls Polar (null polarSubscriptionId)
 *   source 'polar' → mirrors a real Polar subscription
 */
export const subscription = sqliteTable('subscription', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  planSlug: text('planSlug').notNull(), // key into shared/catalog PLANS
  status: text('status').notNull().default('active'), // active|trialing|past_due|canceled|expired
  currentPeriodEnd: integer('currentPeriodEnd', { mode: 'timestamp_ms' }), // null = perpetual (free tier)
  cancelAtPeriodEnd: integer('cancelAtPeriodEnd', { mode: 'boolean' }).notNull().default(false),
  source: text('source').notNull().default('polar'), // seed|polar
  polarSubscriptionId: text('polarSubscriptionId'),
  polarCustomerId: text('polarCustomerId'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, t => [
  index('subscription_user_idx').on(t.userId),
  // SQLite treats NULLs as distinct → many seeded rows (null id) coexist; live rows are unique.
  uniqueIndex('subscription_polar_unique').on(t.polarSubscriptionId),
])

/**
 * Family-plan seat (e.g. NordPass Family, 6 seats). NOT an org — kept entirely
 * out of the org/claims/access path. UNIQUE(subscriptionId,email) + a count-gated
 * conditional insert in familyAddMember enforce the seat cap without a TOCTOU race.
 */
export const subscriptionMember = sqliteTable('subscriptionMember', {
  id: text('id').primaryKey(),
  subscriptionId: text('subscriptionId').notNull().references(() => subscription.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  userId: text('userId').references(() => user.id, { onDelete: 'cascade' }), // null until the invitee signs in
  status: text('status').notNull().default('invited'), // owner|member|invited
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, t => [
  index('subscriptionMember_sub_idx').on(t.subscriptionId),
  uniqueIndex('subscriptionMember_unique').on(t.subscriptionId, t.email),
])
```

> `epochMs()` is defined but the inline `integer(...).default(sql...)` is used
> per-column to keep the distinct column names (`createdAt`/`updatedAt`) — delete
> the unused `epochMs` helper before commit (lint will flag it). It is shown only
> to document the timestamp idiom; **use the inline form**.

### Wire the table into the generated schema entry
`access.ts` is already picked up, so confirm the mechanism, then mirror it:

```bash
# Find how custom schema is aggregated (barrel file or drizzle glob):
```
- If `server/db/schema/index.ts` exists and re-exports `./access`, **add**
  `export * from './billing'`.
- If there is no barrel (nuxthub globs `server/db/schema/*.ts`), nothing to add —
  the new file is auto-included.
- Confirm via the drizzle/nuxthub config (search for `schema:` referencing
  `server/db/schema`).

## Step 1.2 — generate + apply migration

```bash
pnpm exec nuxi db generate
```
Expected: a new SQL migration (e.g. `0002_*.sql`) containing
`CREATE TABLE \`subscription\`` and `CREATE TABLE \`subscriptionMember\`` plus
the three indexes. **Restart `pnpm dev`** (migrations apply on dev boot per
CLAUDE.md). Verify tables exist:
```bash
# after dev boot, the tables are queryable by the seed task in Phase 02
```

## Step 1.3 — `shared/subscription.ts` (types + status helpers)

```ts
// Pure, isomorphic helpers (client + server). No DB imports here.

export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired'
export type SubscriptionSource = 'seed' | 'polar'
export type FamilyMemberStatus = 'owner' | 'member' | 'invited'

export interface SubscriptionRow {
  id: string
  userId: string
  planSlug: string
  status: SubscriptionStatus
  currentPeriodEnd: number | null // epoch ms
  cancelAtPeriodEnd: boolean
  source: SubscriptionSource
  polarSubscriptionId: string | null
  polarCustomerId: string | null
  createdAt: number
  updatedAt: number
}

/**
 * SINGLE source of "is this entitlement live right now" — used by UI, the
 * entitlements claim, and any gate. Never compare the raw status string ad hoc.
 * null currentPeriodEnd = perpetual (free tier) → active while status is active.
 */
export function isActive(sub: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd'>, now = Date.now()): boolean {
  if (sub.status !== 'active' && sub.status !== 'trialing')
    return false
  if (sub.currentPeriodEnd == null)
    return true
  return sub.currentPeriodEnd > now
}

/** "Renews on October 3, 2027" / "Expired on December 14, 2023" — formatted from a UTC epoch. */
export function formatPeriodEnd(sub: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd'>, now = Date.now()): string {
  if (sub.currentPeriodEnd == null)
    return sub.status === 'active' ? 'Free' : ''
  const d = new Date(sub.currentPeriodEnd)
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const expired = !isActive(sub, now)
  if (expired)
    return `Expired on ${date}`
  return sub.cancelAtPeriodEnd ? `Cancels on ${date}` : `Renews on ${date}`
}
```

## Step 1.4 — `shared/catalog.ts` (static Nord catalog)

```ts
// The Nord product catalog. Static + typed — products/plans never change at
// runtime, so this is a constant, not a DB table. polarProductId is NOT here
// (it stays server-only env in server/services/polar-products.ts); the client
// only needs slugs + display.

export interface CatalogProduct {
  slug: string
  name: string
  tagline: string
  icon: string // i-lucide-* (bundled locally → CSP-safe)
  color: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral'
  category: string
  /** oauthClient.name this product corresponds to (entitlement mapping); null = no RP app. */
  clientName: string | null
  appUrl: string | null
  downloadUrl: string | null
}

export interface CatalogPlan {
  slug: string // matches subscription.planSlug
  productSlug: string
  name: string
  billingInterval: 'month' | 'year' | 'none'
  priceCents: number // display only; Polar is the billing authority
  currency: string
  seats: number // 1 = individual; 6 = NordPass Family
  features: string[]
}

export const PRODUCTS: readonly CatalogProduct[] = [
  { slug: 'nordvpn', name: 'NordVPN', tagline: 'Online security starts with a click.', icon: 'i-lucide-shield-check', color: 'info', category: 'VPN', clientName: 'NordVPN', appUrl: 'https://nordvpn.com', downloadUrl: 'https://nordvpn.com/download/' },
  { slug: 'nordpass', name: 'NordPass', tagline: 'Remember just one password.', icon: 'i-lucide-key-round', color: 'primary', category: 'Password Manager', clientName: 'NordPass', appUrl: 'https://nordpass.com', downloadUrl: 'https://nordpass.com/download/' },
  { slug: 'nordlocker', name: 'NordLocker', tagline: 'Encrypted cloud storage.', icon: 'i-lucide-folder-lock', color: 'success', category: 'Encrypted Storage', clientName: 'NordLocker', appUrl: 'https://nordlocker.com', downloadUrl: 'https://nordlocker.com/download/' },
  { slug: 'dark-web-monitor', name: 'Dark Web Monitor', tagline: 'Get alerts if your data leaks.', icon: 'i-lucide-radar', color: 'error', category: 'Security', clientName: null, appUrl: null, downloadUrl: null },
] as const

export const PLANS: readonly CatalogPlan[] = [
  { slug: 'nordvpn-complete', productSlug: 'nordvpn', name: 'NordVPN Complete', billingInterval: 'year', priceCents: 7188, currency: 'USD', seats: 1, features: ['VPN on 10 devices', 'Threat Protection Pro', 'Dark Web Monitor', '1 TB encrypted storage'] },
  { slug: 'dark-web-monitor', productSlug: 'dark-web-monitor', name: 'Dark Web Monitor', billingInterval: 'year', priceCents: 0, currency: 'USD', seats: 1, features: ['Continuous breach scanning', 'Instant leak alerts'] },
  { slug: 'nordpass-premium', productSlug: 'nordpass', name: 'NordPass Premium', billingInterval: 'year', priceCents: 3588, currency: 'USD', seats: 1, features: ['Unlimited passwords & passkeys', 'Data Breach Scanner', 'Email masking', 'Password Health'] },
  { slug: 'nordpass-family', productSlug: 'nordpass', name: 'NordPass Family', billingInterval: 'year', priceCents: 8388, currency: 'USD', seats: 6, features: ['6 Premium accounts', 'Family folder sharing', 'Individual private vaults'] },
  { slug: 'nordlocker-free', productSlug: 'nordlocker', name: 'NordLocker Free, 3 GB', billingInterval: 'none', priceCents: 0, currency: 'USD', seats: 1, features: ['3 GB encrypted storage', 'Secure file sharing'] },
] as const

export function planBySlug(slug: string): CatalogPlan | undefined {
  return PLANS.find(p => p.slug === slug)
}
export function productBySlug(slug: string): CatalogProduct | undefined {
  return PRODUCTS.find(p => p.slug === slug)
}
export function productByClientName(name: string): CatalogProduct | undefined {
  return PRODUCTS.find(p => p.clientName === name)
}
export function plansForProduct(productSlug: string): CatalogPlan[] {
  return PLANS.filter(p => p.productSlug === productSlug)
}
```

> `#shared/*` alias is confirmed working (`auth.config.ts` imports
> `#shared/permissions`). These resolve as `#shared/catalog` / `#shared/subscription`.

## Verify (Phase 01 done)

```bash
pnpm exec nuxi db generate     # migration created with both tables
pnpm exec nuxi typecheck       # 0 errors
```
Restart `pnpm dev` so the migration applies. No runtime behavior yet — the
tables are empty and the catalog is unused until Phase 02.
