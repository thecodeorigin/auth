import type { H3Event } from 'h3'
import type { AbilityRule, PublicSession } from '../../../contract'
import { deleteCookie, getCookie, setCookie } from 'h3'
import { useRuntimeConfig, useStorage } from 'nitropack/runtime'

export interface SessionRecord {
  sub: string
  user: { sub: string, email: string, name: string | null, picture: string | null }
  abilities: AbilityRule[]
  systemRole: string | null
  organizations: PublicSession['organizations']
  activeOrg: string | null
  entitlement: PublicSession['entitlement']
  accessToken: string
  refreshToken: string | null
  idToken: string | null
  accessExpiresAt: number
  isImpersonation: boolean
  impersonator: { sub: string, email: string, name: string | null, picture: string | null } | null
  backupId: string | null
}

function key(id: string) {
  return `session:${id}`
}

export function newSessionId(): string {
  const a = new Uint8Array(32)
  crypto.getRandomValues(a)
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function writeSessionRecord(id: string, rec: SessionRecord): Promise<void> {
  const { auth: runtimeConfig } = useRuntimeConfig()
  await useStorage(runtimeConfig.sessionStorageBase).setItem(key(id), rec)
}

export async function readSessionRecord(event: H3Event): Promise<{ id: string, rec: SessionRecord } | null> {
  const { auth: runtimeConfig } = useRuntimeConfig()
  const id = getCookie(event, runtimeConfig.sessionCookieName)
  if (!id)
    return null
  const rec = await useStorage(runtimeConfig.sessionStorageBase).getItem<SessionRecord>(key(id))
  return rec ? { id, rec } : null
}

export async function setSessionCookie(event: H3Event, id: string): Promise<void> {
  const { auth: runtimeConfig } = useRuntimeConfig()
  setCookie(event, runtimeConfig.sessionCookieName, id, {
    httpOnly: true,
    secure: !import.meta.dev,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  })
}

export async function destroySession(event: H3Event): Promise<SessionRecord | null> {
  const { auth: runtimeConfig } = useRuntimeConfig()
  const id = getCookie(event, runtimeConfig.sessionCookieName)
  if (!id)
    return null
  const rec = await useStorage(runtimeConfig.sessionStorageBase).getItem<SessionRecord>(key(id))
  await useStorage(runtimeConfig.sessionStorageBase).removeItem(key(id))
  deleteCookie(event, runtimeConfig.sessionCookieName, { path: '/' })
  return rec
}

export async function readSessionRecordById(id: string): Promise<SessionRecord | null> {
  const { auth: runtimeConfig } = useRuntimeConfig()
  return useStorage(runtimeConfig.sessionStorageBase).getItem<SessionRecord>(key(id))
}

/** Server-safe session for domain routes — no tokens, no internal storage fields. */
export async function getServerAuthSession(event: H3Event) {
  const s = await readSessionRecord(event)
  if (!s)
    return null
  return {
    sub: s.rec.sub,
    email: s.rec.user.email,
    name: s.rec.user.name,
    picture: s.rec.user.picture,
    systemRole: s.rec.systemRole,
    abilities: s.rec.abilities,
    organizations: s.rec.organizations,
    activeOrg: s.rec.activeOrg,
    entitlement: s.rec.entitlement,
    isImpersonation: s.rec.isImpersonation,
    impersonator: s.rec.impersonator,
  }
}

export type ServerAuthSession = NonNullable<Awaited<ReturnType<typeof getServerAuthSession>>>

/** Browser-safe projection — tokens are excluded. */
export function toPublicSession(rec: SessionRecord): PublicSession {
  return {
    user: rec.user,
    abilities: rec.abilities,
    systemRole: rec.systemRole,
    organizations: rec.organizations,
    activeOrg: rec.activeOrg,
    entitlement: rec.entitlement,
    impersonator: rec.impersonator,
  }
}
