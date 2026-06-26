import type { H3Event } from 'h3'
import { getRequestHost, getRequestProtocol } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { $fetch } from 'ofetch'

export interface ResolvedAuthConfig {
  issuer: string
  clientId: string
  clientSecret: string
  scopes: string[]
  routes: { signIn: string, callback: string, signOut: string, home: string, error: string }
  cookieName: string
  storageBase: string
}

export function resolveAuthConfig(): ResolvedAuthConfig {
  const rc = useRuntimeConfig()
  const pub = (rc.public as Record<string, unknown> & { auth?: Record<string, unknown> }).auth ?? {}
  const priv = (rc as Record<string, unknown> & { auth?: Record<string, unknown> }).auth ?? {}
  const domain = process.env.NUXT_THECODEORIGIN_DOMAIN || (pub.domain as string | undefined) || ''
  return {
    issuer: process.env.NUXT_THECODEORIGIN_ISSUER || (pub.issuer as string | undefined) || (domain ? `https://${domain}/api/auth` : ''),
    clientId: process.env.NUXT_THECODEORIGIN_CLIENT_ID || (pub.clientId as string | undefined) || '',
    clientSecret: process.env.NUXT_THECODEORIGIN_CLIENT_SECRET || (priv.clientSecret as string | undefined) || '',
    scopes: (pub.scopes as string[] | undefined) ?? ['openid', 'profile', 'email'],
    routes: pub.routes as ResolvedAuthConfig['routes'],
    cookieName: (priv.sessionCookieName as string | undefined) || 'tco_auth',
    storageBase: (priv.sessionStorageBase as string | undefined) || 'auth',
  }
}

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function randomString(len = 64): string {
  const a = new Uint8Array(len)
  crypto.getRandomValues(a)
  return b64url(a.buffer).slice(0, len)
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
}

export function callbackRedirectUri(event: H3Event, cfg: ResolvedAuthConfig): string {
  const proto = getRequestProtocol(event)
  const host = getRequestHost(event)
  return `${proto}://${host}${cfg.routes.callback}`
}

export async function exchangeCode(cfg: ResolvedAuthConfig, code: string, verifier: string, redirectUri: string) {
  return $fetch<{ access_token: string, refresh_token?: string, expires_in?: number, id_token?: string }>(
    `${cfg.issuer}/oauth2/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${cfg.clientId}:${cfg.clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }).toString(),
    },
  )
}

export async function fetchUserinfo(cfg: ResolvedAuthConfig, accessToken: string) {
  return $fetch(`${cfg.issuer}/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

/** Same-origin, path-only redirect target (prevents open redirect). */
export function safePath(target: string | undefined, fallback: string): string {
  if (!target || !target.startsWith('/') || target.startsWith('//'))
    return fallback
  return target
}
