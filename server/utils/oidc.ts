import { z } from 'zod'

const oidcClientSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(['web', 'native', 'user-agent-based']).optional(),
  public: z.boolean().optional(),
  redirectUris: z.array(z.string().url()).min(1),
  skipConsent: z.boolean().optional(),
})

export type OidcClient = z.infer<typeof oidcClientSchema>

export function parseOidcClients(raw: unknown): OidcClient[] {
  if (raw === null || raw === undefined || raw === '')
    return []

  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    }
    catch (error) {
      console.error('Failed to parse NUXT_OIDC_CLIENTS:', error)
      return []
    }
  }

  const result = z.array(oidcClientSchema).safeParse(value)
  if (!result.success) {
    console.error('Invalid NUXT_OIDC_CLIENTS:', result.error.message)
    return []
  }
  return result.data
}

export async function hashClientSecret(secret: string): Promise<string> {
  const data = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}
