// Server-only. Maps our plan slugs ⇄ Polar sandbox product IDs (from env), and
// builds the checkout product list. Real product IDs never reach the client.

interface PolarRuntimeConfig {
  polarAccessToken?: string
  polarProductNordvpn?: string
  polarProductNordpassPremium?: string
  polarProductNordpassFamily?: string
  polarProductNordlocker?: string
}

interface PolarProductLink { planSlug: string, productId: string }

// `rc` is passed explicitly from auth.config.ts (setup time has no useRuntimeConfig
// auto-import); runtime callers (routes, webhook) omit it and fall back to the
// Nitro-global useRuntimeConfig(). The default is lazy — only evaluated when omitted.
function links(rc: PolarRuntimeConfig = useRuntimeConfig()): PolarProductLink[] {
  const raw: Array<[string, string | undefined]> = [
    ['nordvpn-complete', rc.polarProductNordvpn],
    ['nordpass-premium', rc.polarProductNordpassPremium],
    ['nordpass-family', rc.polarProductNordpassFamily],
    ['nordlocker-free', rc.polarProductNordlocker],
    // dark-web-monitor is bundled / not separately purchasable → no Polar product.
  ]
  return raw.filter(([, id]) => !!id).map(([planSlug, productId]) => ({ planSlug, productId: productId! }))
}

/** For checkout({ products }): [{ productId, slug }] where slug = our plan slug. */
export function polarCheckoutProducts(rc?: PolarRuntimeConfig): Array<{ productId: string, slug: string }> {
  return links(rc).map(l => ({ productId: l.productId, slug: l.planSlug }))
}

/** Webhook reverse lookup: Polar product_id → our plan slug. */
export function polarPlanSlugForProduct(productId: string, rc?: PolarRuntimeConfig): string | null {
  return links(rc).find(l => l.productId === productId)?.planSlug ?? null
}

/** Is live Polar usable at all? (token present) */
export function isPolarConfigured(rc?: PolarRuntimeConfig): boolean {
  return !!(rc ?? useRuntimeConfig()).polarAccessToken
}
