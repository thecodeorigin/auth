import type { SubscriptionRow } from '#shared/subscription'

/** Data layer for the signed-in user's own subscriptions (custom Nitro routes via $http). */
export function useSubscriptionsApi() {
  return {
    list: () => $http<SubscriptionRow[]>('/api/account/subscriptions'),
  }
}
