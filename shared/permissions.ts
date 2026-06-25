import { createAccessControl } from 'better-auth/plugins/access'

export const statement = {
  project: ['create', 'read', 'update', 'delete'],
  member: ['create', 'update', 'delete'],
  role: ['create', 'update', 'delete'],
} as const

export const ac = createAccessControl(statement)

export const member = ac.newRole({
  project: ['read'],
})

export const admin = ac.newRole({
  project: ['create', 'read', 'update'],
  member: ['create', 'update'],
  role: ['create', 'update', 'delete'],
})

export const owner = ac.newRole({
  project: ['create', 'read', 'update', 'delete'],
  member: ['create', 'update', 'delete'],
  role: ['create', 'update', 'delete'],
})

export const roles = { owner, admin, member }

/**
 * Flatten an org role's statements into `subject:action` strings.
 * Returns [] for an unknown or null role.
 */
export function abilitiesForRole(role: string | null | undefined): string[] {
  if (!role)
    return []
  const def = (roles as Record<string, { statements?: Record<string, readonly string[]> }>)[role]
  const statements = def?.statements
  if (!statements)
    return []
  const out: string[] = []
  for (const [subject, actions] of Object.entries(statements)) {
    for (const action of actions)
      out.push(`${subject}:${action}`)
  }
  return out
}
