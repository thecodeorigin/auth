import { db } from '@nuxthub/db'
import { parseOrgMeta } from './organization'

export interface AuthorizationClaims {
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
 * DEFAULT-CLOSED (open question #3): access requires an explicit memberAppScope row.
 * Selection (clientId provided): among orgs that GRANT access to clientId, tier by grant quality
 *   tier 0: an exact memberAppScope row for clientId
 *   tier 1: a '*' (all-apps) memberAppScope row
 *   (no tier 2 — an org with no matching row is NOT a candidate; the user has no access there)
 * then deterministic tiebreak: personal org first → oldest createdAt → organizationId.
 * This makes an explicit App-A grant win deterministically (fixes SEC-01 + the C-2 leak path).
 *
 * TODO(auth-hub phase 4.5, deferred): when the user has >1 eligible org for the requesting
 * client, support an `organization_id` authorize param to force the org instead of the
 * deterministic tier-pick (open question #1). Until then, this tiering is the behavior.
 *
 * v1 emits the role NAME in `roles`; the RP derives abilities from the static #shared/permissions
 * statement. Dynamic-role (organizationRole.permission) resolution is deferred (must be org-scoped).
 */
export async function getAuthorizationClaims(userId: string, clientId?: string | null): Promise<AuthorizationClaims> {
  const empty: AuthorizationClaims = { org: null, roles: null, personal: false }
  try {
    const memberships = await db.query.member.findMany({
      where: (m, { eq }) => eq(m.userId, userId),
      with: { organization: true },
    })
    if (!memberships.length)
      return empty

    const scopes = await db.query.memberAppScope.findMany({
      where: (s, { eq }) => eq(s.userId, userId),
    })

    const rows: Row[] = memberships.map(m => ({
      organizationId: m.organizationId,
      role: m.role,
      createdAt: m.createdAt ?? null,
      personal: parseOrgMeta(m.organization?.metadata).personal === true,
    }))

    // No app context: deterministic active org only.
    if (!clientId) {
      const pick = [...rows].sort(byActive)[0]
      return pick ? { org: pick.organizationId, roles: pick.role, personal: pick.personal } : empty
    }

    interface Cand { row: Row, role: string, tier: 0 | 1 }
    const candidates: Cand[] = []
    for (const row of rows) {
      const orgScopes = scopes.filter(s => s.organizationId === row.organizationId)
      const exact = orgScopes.find(s => s.clientId === clientId)
      if (exact) {
        candidates.push({ row, role: exact.role ?? row.role, tier: 0 })
        continue
      }
      const star = orgScopes.find(s => s.clientId === STAR)
      if (star) {
        candidates.push({ row, role: star.role ?? row.role, tier: 1 })
        continue
      }
      // DEFAULT-CLOSED: no exact and no '*' row for this org => the user has NO access to this app
      // in this org. Not a candidate. (A member with zero scope rows is denied everywhere.)
    }
    if (!candidates.length)
      return empty

    candidates.sort((a, b) => a.tier - b.tier || byActive(a.row, b.row))
    const chosen = candidates[0]
    return { org: chosen.row.organizationId, roles: chosen.role, personal: chosen.row.personal }
  }
  catch (error) {
    console.error('[auth] getAuthorizationClaims failed', userId, clientId, error)
    return empty
  }
}

function byActive(a: Row, b: Row): number {
  if (a.personal !== b.personal)
    return a.personal ? -1 : 1
  const t = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  return t !== 0 ? t : a.organizationId.localeCompare(b.organizationId)
}
