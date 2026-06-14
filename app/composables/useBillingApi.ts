/**
 * Billing data layer. Polar checkout/portal/state run CLIENT-SIDE only (the
 * better-auth client is null on SSR) — call these from event handlers / onMounted.
 * Checkout & portal are full-page redirects to Polar (CSP-safe; not embedded).
 */
export function useBillingApi() {
  const client = useAuthClient()
  function c() {
    if (!client)
      throw createError({ statusCode: 500, statusMessage: 'Auth client unavailable' })
    return client
  }
  return {
    config: () => $http<{ polarConfigured: boolean }>('/api/billing/config'),
    checkout: (slug: string) => c().checkout({ slug }),
    portal: () => c().customer.portal(),
    state: () => c().customer.state(),
    orders: (query: { page?: number, limit?: number } = {}) =>
      c().customer.orders.list({ query: { page: 1, limit: 20, ...query } }),
  }
}
