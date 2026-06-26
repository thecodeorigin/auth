import type { H3Event } from 'h3'
import type { SessionRecord } from './session'
import { createError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { $fetch } from 'ofetch'
import { readSessionRecordById, writeSessionRecord } from './session'

const SKEW_MS = 60_000

async function refresh(rec: SessionRecord): Promise<boolean> {
  if (rec.isImpersonation || !rec.refreshToken)
    return false
  const { auth: runtimeConfig, public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  try {
    const t = await $fetch<{ access_token: string, refresh_token?: string, expires_in?: number }>(
      `https://${publicRuntimeConfig.domain}/api/auth/oauth2/token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${publicRuntimeConfig.clientId}:${runtimeConfig.clientSecret}`)}`,
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rec.refreshToken }).toString(),
      },
    )
    rec.accessToken = t.access_token
    rec.refreshToken = t.refresh_token ?? rec.refreshToken
    rec.accessExpiresAt = Date.now() + (t.expires_in ?? 3600) * 1000
    return true
  }
  catch {
    return false
  }
}

/**
 * Call an IdP path with the session's bearer token. Refreshes once on expiry/401.
 * Persists the rotated record. Returns parsed JSON.
 */
export async function idpFetch<T>(
  event: H3Event,
  id: string,
  rec: SessionRecord,
  path: string,
  opts: { method?: string, body?: Record<string, unknown>, query?: Record<string, string | number> } = {},
): Promise<T> {
  const { public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  if (!rec.isImpersonation && Date.now() > rec.accessExpiresAt - SKEW_MS) {
    if (await refresh(rec))
      await writeSessionRecord(id, rec)
  }

  const call = () =>
    $fetch<T>(`https://${publicRuntimeConfig.domain}${path}`, {
      method: opts.method as 'GET' | 'POST' | undefined,
      body: opts.body,
      query: opts.query as Record<string, string> | undefined,
      headers: { Authorization: `Bearer ${rec.accessToken}` },
    })

  try {
    return await call()
  }
  catch (e: unknown) {
    const status = (e as { response?: { status?: number } })?.response?.status
    if (status !== 401)
      throw e
    const fresh = await readSessionRecordById(id)
    if (fresh && fresh.accessToken !== rec.accessToken) {
      Object.assign(rec, fresh)
      return call()
    }
    if (await refresh(rec)) {
      await writeSessionRecord(id, rec)
      return call()
    }
    throw createError({ statusCode: 401, statusMessage: 'Session expired' })
  }
}
