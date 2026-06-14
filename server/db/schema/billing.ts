import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { user } from '../../../.nuxt/better-auth/schema.sqlite'

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
