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

/**
 * All organizations the given client may act in for this user, default-closed
 * (same access-grant model as claimsResolve), ordered personal→oldest.
 * Returns [] when the client has no grants anywhere.
 */
export async function claimsResolveAll(userId: string, clientId?: string | null): Promise<import('#shared/auth-contract').RpOrganization[]> {
  try {
    const memberships = await db.query.member.findMany({
      where: (m, { eq }) => eq(m.userId, userId),
      with: { organization: true },
    })
    if (!memberships.length)
      return []

    const grants = clientId
      ? await db.query.access.findMany({ where: (s, { eq }) => eq(s.userId, userId) })
      : []

    interface Cand { row: Row, role: string, tier: 0 | 1, name: string, slug: string }
    const out: Cand[] = []
    for (const m of memberships) {
      const row: Row = {
        organizationId: m.organizationId,
        role: m.role,
        createdAt: m.createdAt ?? null,
        personal: orgParseMeta(m.organization?.metadata).personal === true,
      }
      const name = m.organization?.name ?? ''
      const slug = m.organization?.slug ?? m.organizationId
      if (!clientId) {
        out.push({ row, role: row.role, tier: 1, name, slug })
        continue
      }
      const orgGrants = grants.filter(s => s.organizationId === row.organizationId)
      const exact = orgGrants.find(s => s.clientId === clientId)
      if (exact) {
        out.push({ row, role: exact.role ?? row.role, tier: 0, name, slug })
        continue
      }
      const star = orgGrants.find(s => s.clientId === STAR)
      if (star)
        out.push({ row, role: star.role ?? row.role, tier: 1, name, slug })
      // DEFAULT-CLOSED: no grant for this org → skip
    }
    out.sort((a, b) => a.tier - b.tier || byActive(a.row, b.row))
    return out.map(c => ({ id: c.row.organizationId, slug: c.slug, name: c.name, role: c.role, personal: c.row.personal }))
  }
  catch (error) {
    console.error('[auth] claimsResolveAll failed', userId, clientId, error)
    return []
  }
}
