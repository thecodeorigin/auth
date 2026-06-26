import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const impersonationAudit = sqliteTable('impersonationAudit', {
  id: text('id').primaryKey(),
  impersonatorId: text('impersonatorId').notNull(),
  targetId: text('targetId').notNull(),
  clientId: text('clientId').notNull(),
  action: text('action').notNull(), // 'start' | 'stop'
  tokenId: text('tokenId'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
})
