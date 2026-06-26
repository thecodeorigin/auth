import type { H3Event } from 'h3'
import { getRequestHost, getRequestProtocol } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { $fetch } from 'ofetch'

declare module 'nitropack' {
  interface NitroRuntimeConfig {
    auth: {
      clientSecret: string
      sessionStorageBase: string
      sessionCookieName: string
    }
  }
  interface NitroRuntimePublicConfig {
    auth: {
      domain: string
      clientId: string
      routes: { signIn: string, callback: string, signOut: string, home: string, error: string }
      scopes: string[]
    }
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

export function callbackRedirectUri(event: H3Event): string {
  const { public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  return `${getRequestProtocol(event)}://${getRequestHost(event)}${publicRuntimeConfig.routes.callback}`
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const { auth: runtimeConfig, public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  return $fetch<{ access_token: string, refresh_token?: string, expires_in?: number, id_token?: string }>(
    `https://${publicRuntimeConfig.domain}/api/auth/oauth2/token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${publicRuntimeConfig.clientId}:${runtimeConfig.clientSecret}`)}`,
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

export async function fetchUserinfo(accessToken: string) {
  const { public: { auth: publicRuntimeConfig } } = useRuntimeConfig()
  return $fetch(`https://${publicRuntimeConfig.domain}/api/auth/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
}

/** Same-origin, path-only redirect target (prevents open redirect). */
export function safePath(target: string | undefined, fallback: string): string {
  if (!target || !target.startsWith('/') || target.startsWith('//'))
    return fallback
  return target
}
