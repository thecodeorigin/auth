import type { AbilityMap, AbilityRule } from '#shared/abilities'
import { db } from '@nuxthub/db'
import { abilityMapSchema } from '#shared/abilities'

/**
 * Parse a metadata literal that may be an object, JSON, or double/triple-encoded JSON
 * (the better-auth adapter is inconsistent — same pattern as parseStringArray in client.ts).
 * Returns a plain object or {}.
 */
export function parseMetadata(raw: unknown): Record<string, unknown> {
  let v: unknown = raw
  for (let depth = 0; depth < 3 && typeof v === 'string'; depth++) {
    try {
      v = JSON.parse(v)
    }
    catch {
      return {}
    }
  }
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {}
}

/** Read + validate the ability map out of a client's metadata. Invalid → {} (default-closed). */
export function readAbilities(metadata: unknown): AbilityMap {
  const meta = parseMetadata(metadata)
  const parsed = abilityMapSchema.safeParse(meta.abilities)
  return parsed.success ? parsed.data : {}
}

/** Whitelisted placeholder tokens → resolver. Returns null when the value resolves empty. */
const TOKENS: Record<string, (ctx: { userId: string }) => string | null> = {
  // eslint-disable-next-line no-template-curly-in-string
  '${user.id}': ctx => ctx.userId || null,
}

function resolveValue(value: string, ctx: { userId: string }): string | null {
  if (Object.hasOwn(TOKENS, value))
    return TOKENS[value]!(ctx)
  // Schema already blocks foreign ${…}; this is belt-and-suspenders.
  return value.includes('${') ? null : value
}

/**
 * Resolve a client's CASL rules for a SERVER-RESOLVED role. Mirrors entitlementsResolve.
 *
 * DEFAULT-CLOSED: returns [] when clientId/roleName is null/absent, the client is missing,
 * or the role has no own entry. A rule whose condition placeholder resolves empty is DROPPED.
 *
 * SECURITY: `roleName` MUST come from claimsResolve (server-resolved). Never pass a value
 * derived from an authorize param / scope / request input — that would be attacker-controlled.
 */
export async function abilitiesResolve(
  userId: string,
  clientId: string | null | undefined,
  roleName: string | null,
): Promise<AbilityRule[]> {
  if (!clientId || !roleName)
    return []
  try {
    const client = await db.query.oauthClient.findFirst({ where: (c, { eq }) => eq(c.clientId, clientId) })
    if (!client)
      return []
    const map = readAbilities(client.metadata)
    if (!Object.hasOwn(map, roleName))
      return []
    const rules = map[roleName]
    if (!Array.isArray(rules))
      return []

    const out: AbilityRule[] = []
    for (const rule of rules) {
      if (!rule.conditions) {
        out.push({ action: rule.action, subject: rule.subject })
        continue
      }
      const conditions: Record<string, string> = Object.create(null)
      let ok = true
      for (const [k, v] of Object.entries(rule.conditions)) {
        const resolved = resolveValue(v, { userId })
        if (resolved === null) {
          ok = false
          break // default-closed: never emit a blank scope
        }
        conditions[k] = resolved
      }
      if (ok)
        out.push({ action: rule.action, subject: rule.subject, conditions })
    }
    return out
  }
  catch (error) {
    console.error('[auth] abilitiesResolve failed', userId, clientId, error)
    return []
  }
}
