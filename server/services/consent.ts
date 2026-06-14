import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'

export interface AdminConsentRow {
  id: string
  clientId: string
  clientName: string | null
  userId: string | null
  userEmail: string | null
  scopes: string[]
  createdAt: number | null
}

function parseScopes(raw: unknown): string[] {
  if (Array.isArray(raw))
    return raw.filter((s): s is string => typeof s === 'string')
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw)
      return Array.isArray(p) ? p : raw.split(/[\s,]+/).filter(Boolean)
    }
    catch {
      return raw.split(/[\s,]+/).filter(Boolean)
    }
  }
  return []
}

/** Cross-user consent list for the platform admin (caller-scoped client API can't do this). */
export async function consentListAll(): Promise<AdminConsentRow[]> {
  try {
    const rows = await db.all<{ id: string, clientId: string, clientName: string | null, userId: string | null, userEmail: string | null, scopes: string, createdAt: number | null }>(
      sql`select c."id", c."clientId", oc."name" as "clientName", c."userId", u."email" as "userEmail", c."scopes", c."createdAt"
          from "oauthConsent" c
          left join "user" u on u."id" = c."userId"
          left join "oauthClient" oc on oc."clientId" = c."clientId"
          order by c."createdAt" desc`,
    )
    return rows.map(r => ({
      id: r.id,
      clientId: r.clientId,
      clientName: r.clientName,
      userId: r.userId,
      userEmail: r.userEmail,
      scopes: parseScopes(r.scopes),
      createdAt: r.createdAt,
    }))
  }
  catch {
    return []
  }
}

export async function consentDeleteById(id: string): Promise<void> {
  await db.run(sql`delete from "oauthConsent" where "id" = ${id}`)
}
