/**
 * Billing data layer. Checkout runs CLIENT-SIDE via the better-auth Polar client
 * (null on SSR) — call it from an event handler. The portal goes through a custom
 * server route that ensures the Polar customer exists first (the built-in portal
 * 500s for users who were never registered as Polar customers).
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
    // catalog plan slug → Polar product id (resolved live from the Polar API).
    products: () => $http<{ polarConfigured: boolean, products: Record<string, string> }>('/api/billing/products'),
    // Checkout is per-product: pass the resolved Polar product id directly.
    checkout: (productId: string) => c().checkout({ products: [productId] }),
    // Ensure-customer + portal session, full-page redirect (CSP-safe).
    portal: () => $http<{ url: string }>('/api/billing/portal'),
  }
}
