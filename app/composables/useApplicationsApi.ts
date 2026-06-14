export interface ClientListItem {
  clientId: string
  name: string | null
  disabled: boolean
}

export interface ClientCreateInput {
  name: string
  redirectUris: string[]
  type?: 'web' | 'native' | 'user-agent-based'
  public?: boolean
  skipConsent?: boolean
}

export interface ClientPatch {
  name?: string
  redirectUris?: string[]
  skipConsent?: boolean
  disabled?: boolean
}

export interface ClientDetail {
  clientId: string
  name: string | null
  type: string | null
  public: boolean
  redirectUris: string[]
  skipConsent: boolean
  disabled: boolean
  createdAt: string | Date | null
}

export interface AdminConsent {
  id: string
  clientId: string
  clientName: string | null
  userId: string | null
  userEmail: string | null
  scopes: string[]
  createdAt: number | null
}

export interface ProviderStatus {
  id: string
  label: string
  configured: boolean
}

/**
 * OAuth applications (clients) + consents + providers. Per SEC-OAUTH the
 * `client.oauth2.*` management methods don't exist, so everything here goes
 * through `$http` to our custom **admin-gated** Nitro routes
 * (`/api/auth/oauth2/clients*`, `/api/admin/*`, app-access under `/api/orgs/*`).
 * The catalog route returns only `{ clientId, name, disabled }` (no secrets);
 * client/rotate return the plaintext secret exactly once.
 */
export function useApplicationsApi() {
  return {
    // Catalog + detail
    list: () => $http<ClientListItem[]>('/api/auth/oauth2/clients'),
    get: (clientId: string) => $http<ClientDetail>(`/api/auth/oauth2/clients/${clientId}`),
    create: (body: ClientCreateInput) => $http<{ clientId: string, clientSecret: string | null }>('/api/auth/oauth2/clients', { method: 'POST', body }),

    // Mutations (custom admin routes — no RFC 7592 token needed)
    update: (clientId: string, patch: ClientPatch) => $http(`/api/auth/oauth2/clients/${clientId}`, { method: 'PATCH', body: patch }),
    rotateSecret: (clientId: string) => $http<{ clientId: string, clientSecret: string }>(`/api/auth/oauth2/clients/${clientId}/rotate-secret`, { method: 'POST' }),
    remove: (clientId: string) => $http(`/api/auth/oauth2/clients/${clientId}`, { method: 'DELETE' }),

    // Per-app access grants
    accessList: (orgId: string, userId: string) => $http(`/api/orgs/${orgId}/members/${userId}/access`),
    accessSet: (orgId: string, userId: string, body: { clientId: string, role?: string | null }) => $http(`/api/orgs/${orgId}/members/${userId}/access`, { method: 'POST', body }),
    accessRevoke: (orgId: string, userId: string, clientId: string) => $http(`/api/orgs/${orgId}/members/${userId}/access/${encodeURIComponent(clientId)}`, { method: 'DELETE' }),

    // Consents — self (better-auth) + admin cross-user (custom routes)
    consents: () => $http('/api/auth/oauth2/get-consents'),
    deleteConsent: (body: Record<string, unknown>) => $http('/api/auth/oauth2/delete-consent', { method: 'POST', body }),
    adminConsents: () => $http<AdminConsent[]>('/api/admin/consents'),
    adminRevokeConsent: (id: string) => $http(`/api/admin/consents/${id}`, { method: 'DELETE' }),

    // Social provider configuration status
    providers: () => $http<{ providers: ProviderStatus[] }>('/api/providers'),
  }
}
