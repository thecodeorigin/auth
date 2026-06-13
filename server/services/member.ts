import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'

export interface AuthorizationClaims {
  org: string | null
  roles: string | null
}

export async function getAuthorizationClaims(userId: string): Promise<AuthorizationClaims> {
  try {
    const rows = await db.all<{ org: string | null, roles: string | null }>(
      sql`select "organizationId" as "org", "role" as "roles" from "member" where "userId" = ${userId} limit 1`,
    )
    const row = rows[0]
    return { org: row?.org ?? null, roles: row?.roles ?? null }
  }
  catch {
    return { org: null, roles: null }
  }
}
