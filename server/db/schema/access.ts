import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { organization, user } from '../../../.nuxt/better-auth/schema.sqlite'

/**
 * member × application access grant (DEFAULT-CLOSED).
 *   clientId === '*'                 → all apps in that org
 *   clientId === <oauthClient.clientId> → exactly that app
 *   role === null                    → inherit the member's base org role
 * NOTE: the SQL table name stays `memberAppScope` to avoid a migration; only the JS export is `access`.
 */
export const access = sqliteTable('memberAppScope', {
  id: text('id').primaryKey(),
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  clientId: text('clientId').notNull().default('*'),
  role: text('role'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, t => [
  index('memberAppScope_org_user_idx').on(t.organizationId, t.userId),
  uniqueIndex('memberAppScope_unique').on(t.organizationId, t.userId, t.clientId),
])
