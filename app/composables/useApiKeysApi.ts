/**
 * API keys — wraps `client.apiKey.*` (personal keys for the signed-in user).
 * Single source of the better-auth api-key method names (SEC-NAMES), verified
 * against the `/api-key/*` endpoint inventory. The raw key is returned by
 * `create` exactly once (SEC-SECRET) — never refetchable.
 */
export function useApiKeysApi() {
  const client = useAuthClient()
  function c() {
    if (!client)
      throw createError({ statusCode: 500, statusMessage: 'Auth client unavailable' })
    return client
  }
  return {
    list: () => c().apiKey.list(),
    get: (id: string) => c().apiKey.get({ query: { id } }),
    create: (b: { name?: string, expiresIn?: number | null, prefix?: string, metadata?: Record<string, unknown> }) => c().apiKey.create(b),
    update: (b: { keyId: string, name?: string, enabled?: boolean }) => c().apiKey.update(b),
    remove: (keyId: string) => c().apiKey.delete({ keyId }),
  }
}
