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
