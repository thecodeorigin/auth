import { db } from '@nuxthub/db'
import { orgParseMeta } from './org'

export interface Claims {
  // Per-app projection emitted into id_token / userinfo. Backward-compatible keys (org, roles).
  org: string | null
  roles: string | null
  personal: boolean
}

const STAR = '*'

interface Row { organizationId: string, role: string, createdAt: Date | null, personal: boolean }

/**
 * Resolve the user's authorization context for the REQUESTING application.
 * @param userId the user whose authorization context to resolve.
 * @param clientId the oauthClient.clientId of the requesting app, or undefined when no app context.
 *
 * DEFAULT-CLOSED: access requires an explicit `access` row. Among orgs that GRANT the client,
 * tier by grant quality — tier 0: exact-client row; tier 1: '*' row — then deterministic tiebreak:
 * personal org → oldest createdAt → organizationId.
 *
 * TODO(auth-hub phase 4.5, deferred): support an `organization_id` authorize param to force the org.
 */
export async function claimsResolve(userId: string, clientId?: string | null): Promise<Claims> {
  const empty: Claims = { org: null, roles: null, personal: false }
  try {
    const memberships = await db.query.member.findMany({
      where: (m, { eq }) => eq(m.userId, userId),
      with: { organization: true },
    })
    if (!memberships.length)
      return empty

    const grants = await db.query.access.findMany({
      where: (s, { eq }) => eq(s.userId, userId),
    })

    const rows: Row[] = memberships.map(m => ({
      organizationId: m.organizationId,
      role: m.role,
      createdAt: m.createdAt ?? null,
      personal: orgParseMeta(m.organization?.metadata).personal === true,
    }))

    if (!clientId) {
      const pick = [...rows].sort(byActive)[0]
      return pick ? { org: pick.organizationId, roles: pick.role, personal: pick.personal } : empty
    }

    interface Cand { row: Row, role: string, tier: 0 | 1 }
    const candidates: Cand[] = []
    for (const row of rows) {
      const orgGrants = grants.filter(s => s.organizationId === row.organizationId)
      const exact = orgGrants.find(s => s.clientId === clientId)
      if (exact) {
        candidates.push({ row, role: exact.role ?? row.role, tier: 0 })
        continue
      }
      const star = orgGrants.find(s => s.clientId === STAR)
      if (star) {
        candidates.push({ row, role: star.role ?? row.role, tier: 1 })
        continue
      }
      // DEFAULT-CLOSED: no exact and no '*' row for this org => no access to this app here.
    }
    candidates.sort((a, b) => a.tier - b.tier || byActive(a.row, b.row))
    const chosen = candidates[0]
    if (!chosen)
      return empty
    return { org: chosen.row.organizationId, roles: chosen.role, personal: chosen.row.personal }
  }
  catch (error) {
    console.error('[auth] claimsResolve failed', userId, clientId, error)
    return empty
  }
}

function byActive(a: Row, b: Row): number {
  if (a.personal !== b.personal)
    return a.personal ? -1 : 1
  const t = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  return t !== 0 ? t : a.organizationId.localeCompare(b.organizationId)
}
