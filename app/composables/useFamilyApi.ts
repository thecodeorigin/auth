import type { FamilyMember } from '#shared/subscription'

/** Data layer for NordPass Family seats (owner-gated server routes). */
export function useFamilyApi() {
  return {
    members: (subscriptionId: string) =>
      $http<FamilyMember[]>(`/api/account/family/${encodeURIComponent(subscriptionId)}/members`),
    add: (subscriptionId: string, email: string) =>
      $http<{ ok: true }>(`/api/account/family/${encodeURIComponent(subscriptionId)}/members`, { method: 'POST', body: { email } }),
    remove: (subscriptionId: string, memberId: string) =>
      $http<{ ok: true }>(`/api/account/family/${encodeURIComponent(subscriptionId)}/members/${encodeURIComponent(memberId)}`, { method: 'DELETE' }),
  }
}
