import type { SubscriptionRow } from '#shared/subscription'

/** Data layer for the signed-in user's own subscriptions (custom Nitro routes via $http). */
export function useSubscriptionsApi() {
  return {
    list: () => $http<SubscriptionRow[]>('/api/account/subscriptions'),
    cancel: (id: string, cancel = true) =>
      $http<{ ok: true }>(`/api/account/subscriptions/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: { cancel } }),
  }
}
