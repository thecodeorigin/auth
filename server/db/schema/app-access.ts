import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'
// Generated better-auth tables. Exists after `nuxt prepare` (postinstall). Drizzle emits the
// FK using the referenced table NAME, so the migration SQL is correct regardless.
import { organization, user } from '../../../.nuxt/better-auth/schema.sqlite'

/**
 * member × application authorization.
 * clientId === '*'  → ALL apps in that org (explicit all-apps grant marker).
 * clientId === <oauthClient.clientId> → access scoped to exactly that app.
 * role === null → inherit the member's base org role for this app context.
 *
 * Semantics (resolved in getAuthorizationClaims) — DEFAULT-CLOSED:
 *   no rows for (org,user)            → NO access to any app in that org
 *   row clientId='*'                  → all apps in that org, with role override if set
 *   one+ rows with specific clientIds → access to exactly those apps, others denied
 * Access ALWAYS requires an explicit row. Provisioning grants the org owner/creator a '*' row;
 * members added by an admin start with ZERO access until granted '*' (all) or specific clients.
 */
export const memberAppScope = sqliteTable('memberAppScope', {
  id: text('id').primaryKey(), // mas-<nanoid>
  organizationId: text('organizationId').notNull().references(() => organization.id, { onDelete: 'cascade' }),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  clientId: text('clientId').notNull().default('*'),
  role: text('role'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' })
    .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
    .notNull(),
}, t => [
  index('memberAppScope_org_user_idx').on(t.organizationId, t.userId),
  // NOT NULL clientId (default '*') makes this unique index actually fire — SQLite treats NULLs as distinct.
  uniqueIndex('memberAppScope_unique').on(t.organizationId, t.userId, t.clientId),
])
