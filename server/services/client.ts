import type { AbilityMap } from '#shared/abilities'
import { db } from '@nuxthub/db'
import { sql } from 'drizzle-orm'
import { sha256Base64Url } from '../utils/hash'
import { randomToken } from '../utils/nanoid'
import { parseMetadata, readAbilities } from './abilities'

type WhereValue = string | number | boolean | string[] | number[] | Date | null

export interface ClientAdapter {
  create: (input: { model: string, data: Record<string, unknown> }) => Promise<unknown>
  findOne: <T>(input: { model: string, where: Array<{ field: string, value: WhereValue }> }) => Promise<T | null>
  update: (input: { model: string, where: Array<{ field: string, value: WhereValue }>, update: Record<string, unknown> }) => Promise<unknown>
  delete: (input: { model: string, where: Array<{ field: string, value: WhereValue }> }) => Promise<unknown>
}

export interface ClientPatch {
  name?: string
  redirectUris?: string[]
  skipConsent?: boolean
  disabled?: boolean
  abilities?: AbilityMap
}

export interface ClientCreateInput {
  name: string
  redirectUris: string[]
  type?: 'web' | 'native' | 'user-agent-based'
  public?: boolean
  skipConsent?: boolean
}

export interface ClientCreateResult {
  clientId: string
  clientSecret: string | null
  name: string
  redirectUris: string[]
  public: boolean
  skipConsent: boolean
}

export interface ClientView {
  clientId: string
  name: string | null
  type: string | null
  public: boolean | null
  redirectUris: string[]
  skipConsent: boolean | null
  disabled: boolean | null
  createdAt: Date | null
  abilities: AbilityMap
}

export interface ClientListItem {
  clientId: string
  name: string | null
  disabled: boolean
}

export async function clientCreate(adapter: ClientAdapter, input: ClientCreateInput): Promise<ClientCreateResult> {
  const isPublic = input.public ?? false
  const clientId = randomToken(24)
  const clientSecret = isPublic ? null : randomToken(48)
  const now = new Date()

  await adapter.create({
    model: 'oauthClient',
    data: {
      id: `oc-${clientId}`,
      clientId,
      clientSecret: clientSecret ? sha256Base64Url(clientSecret) : null,
      name: input.name,
      type: input.type ?? null,
      public: isPublic,
      redirectUris: input.redirectUris,
      skipConsent: input.skipConsent ?? false,
      requirePKCE: true,
      tokenEndpointAuthMethod: isPublic ? 'none' : 'client_secret_basic',
      grantTypes: ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      disabled: false,
      metadata: { clientId }, // ← id_token hook reads metadata.clientId; DO NOT remove
      createdAt: now,
      updatedAt: now,
    },
  })

  return {
    clientId,
    clientSecret,
    name: input.name,
    redirectUris: input.redirectUris,
    public: isPublic,
    skipConsent: input.skipConsent ?? false,
  }
}

export async function clientGet(adapter: ClientAdapter, clientId: string): Promise<ClientView | null> {
  const client = await adapter.findOne<ClientView & { metadata?: unknown }>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
  })
  if (!client)
    return null

  return {
    clientId: client.clientId,
    name: client.name,
    type: client.type,
    public: client.public,
    redirectUris: client.redirectUris,
    skipConsent: client.skipConsent,
    disabled: client.disabled,
    createdAt: client.createdAt,
    abilities: readAbilities(client.metadata),
  }
}

/**
 * Rotate a confidential client's secret. Returns the new plaintext secret ONCE
 * (the stored value is hashed). Returns null if the client is missing; the
 * `public` flag means there is no secret to rotate.
 */
export async function clientRotateSecret(adapter: ClientAdapter, clientId: string): Promise<{ clientId: string, clientSecret: string } | null | 'public'> {
  const existing = await adapter.findOne<{ clientId: string, public: boolean | null }>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
  })
  if (!existing)
    return null
  if (existing.public)
    return 'public'

  const clientSecret = randomToken(48)
  await adapter.update({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
    update: { clientSecret: sha256Base64Url(clientSecret), updatedAt: new Date() },
  })
  return { clientId, clientSecret }
}

export async function clientUpdate(adapter: ClientAdapter, clientId: string, patch: ClientPatch): Promise<boolean> {
  const existing = await adapter.findOne<{ clientId: string, metadata?: unknown }>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
  })
  if (!existing)
    return false

  const update: Record<string, unknown> = { updatedAt: new Date() }
  if (patch.name !== undefined)
    update.name = patch.name
  if (patch.redirectUris !== undefined)
    update.redirectUris = patch.redirectUris
  if (patch.skipConsent !== undefined)
    update.skipConsent = patch.skipConsent
  if (patch.disabled !== undefined)
    update.disabled = patch.disabled
  if (patch.abilities !== undefined) {
    const meta = parseMetadata(existing.metadata)
    // Re-pin clientId from the authoritative column — NEVER trust the merged blob (R1).
    update.metadata = { ...meta, clientId, abilities: patch.abilities }
  }

  await adapter.update({ model: 'oauthClient', where: [{ field: 'clientId', value: clientId }], update })
  return true
}

export async function clientDelete(adapter: ClientAdapter, clientId: string): Promise<boolean> {
  const existing = await adapter.findOne<{ clientId: string }>({
    model: 'oauthClient',
    where: [{ field: 'clientId', value: clientId }],
  })
  if (!existing)
    return false
  await adapter.delete({ model: 'oauthClient', where: [{ field: 'clientId', value: clientId }] })
  return true
}

export async function clientList(): Promise<ClientListItem[]> {
  try {
    const rows = await db.all<{ clientId: string, name: string | null, disabled: number | null }>(
      sql`select "clientId", "name", "disabled" from "oauthClient" order by "name"`,
    )
    return rows.map(row => ({ clientId: row.clientId, name: row.name, disabled: Boolean(row.disabled) }))
  }
  catch {
    return []
  }
}

function parseStringArray(raw: string): string[] {
  let value: unknown = raw
  for (let depth = 0; depth < 3 && typeof value === 'string'; depth++) {
    try {
      value = JSON.parse(value)
    }
    catch {
      return []
    }
  }
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function toOrigin(uri: string): string | null {
  try {
    return new URL(uri).origin
  }
  catch {
    return null
  }
}

export async function clientListOrigins(): Promise<string[]> {
  try {
    const rows = await db.all<{ redirectUris: string }>(
      sql`select "redirectUris" from "oauthClient" where "disabled" = 0`,
    )
    const origins = new Set<string>()
    for (const row of rows) {
      for (const uri of parseStringArray(row.redirectUris)) {
        const origin = toOrigin(uri)
        if (origin)
          origins.add(origin)
      }
    }
    return [...origins]
  }
  catch {
    return []
  }
}
