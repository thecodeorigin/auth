import type { H3Event } from 'h3'
import { db } from '@nuxthub/db'
import { oauthAccessToken, user } from '@nuxthub/db/schema'
import { and, eq, like, ne, or } from 'drizzle-orm'
import { impersonationAudit } from '../db/schema/rp'
import { randomToken } from '../utils/nanoid'

const IMP_PREFIX = 'imp:'
const IMP_TTL_MS = 60 * 30 * 1000 // 30 min absolute

export interface OAuthCaller {
  userId: string
  clientId: string
  scopes: string[]
  isImpersonation: boolean
  tokenRow: { id: string, referenceId: string | null }
}

/** Resolve & validate an `Authorization: Bearer <token>` against oauthAccessToken. */
export async function requireOAuthToken(event: H3Event): Promise<OAuthCaller> {
  const header = getHeader(event, 'authorization') || ''
  if (!header.startsWith('Bearer '))
    throw createError({ statusCode: 401, statusMessage: 'Missing bearer token' })
  const token = header.slice(7).trim()
  const row = await db.query.oauthAccessToken.findFirst({ where: (t, { eq: e }) => e(t.token, token) })
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

/** Impersonatable users: everyone except system admins and the caller. */
export async function impersonatableUsersPage(selfId: string, q: string, limit: number, offset: number): Promise<Page<Candidate>> {
  const adminIds = (useRuntimeConfig().adminUserIds || '').split(',').filter(Boolean)
  const term = q ? `%${q.replace(/[%_\\]/g, m => `\\${m}`)}%` : undefined
  const rows = await db.select({ id: user.id, email: user.email, name: user.name, image: user.image, role: user.role })
    .from(user)
    .where(
      and(
        ne(user.id, selfId),
        ne(user.role, 'admin'),
        term ? or(like(user.name!, term), like(user.email, term)) : undefined,
      ),
    )
    .orderBy(user.email)
    .limit(limit + 1)
    .offset(offset)
  // also filter out adminUserIds-admins (env-level admins may not have user.role='admin')
  const filtered = rows.filter(r => !adminIds.includes(r.id))
  return {
    items: filtered.slice(0, limit).map(({ role: _r, ...rest }) => rest),
    hasMore: filtered.length > limit,
  }
}

/** Mint a non-refreshable, short-lived access token acting as `targetUserId`. */
export async function mintImpersonationToken(adminId: string, targetUserId: string, clientId: string): Promise<{ token: string, id: string, expiresAt: Date }> {
  const token = randomToken(48)
  const id = `imptok-${randomToken(16)}`
  const expiresAt = new Date(Date.now() + IMP_TTL_MS)
  await db.insert(oauthAccessToken).values({
    id,
    token,
    clientId,
    userId: targetUserId,
    referenceId: `${IMP_PREFIX}${adminId}`,
    refreshId: null,
    expiresAt,
    createdAt: new Date(),
    scopes: ['openid', 'profile', 'email'],
  })
  await db.insert(impersonationAudit).values({
    id: `impa-${randomToken(16)}`,
    impersonatorId: adminId,
    targetId: targetUserId,
    clientId,
    action: 'start',
    tokenId: id,
    createdAt: new Date(),
  })
  return { token, id, expiresAt }
}

export async function revokeImpersonationToken(caller: OAuthCaller): Promise<void> {
  await db.delete(oauthAccessToken).where(eq(oauthAccessToken.id, caller.tokenRow.id))
  const adminId = (caller.tokenRow.referenceId ?? '').slice(IMP_PREFIX.length)
  await db.insert(impersonationAudit).values({
    id: `impa-${randomToken(16)}`,
    impersonatorId: adminId,
    targetId: caller.userId,
    clientId: caller.clientId,
    action: 'stop',
    tokenId: caller.tokenRow.id,
    createdAt: new Date(),
  })
}
