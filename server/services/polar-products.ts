// Server-only. Resolves Polar products at RUNTIME from the Polar API and matches
// them to our static catalog by NAME (Polar product name === catalog plan name).
// No product IDs in env — name your Polar (sandbox) products to match the catalog
// plan names (e.g. "NordPass Premium", "NordVPN Complete") and checkout/webhook
// resolution just works. Checkout is per-product: the UI passes the resolved
// Polar product id directly to authClient.checkout({ products: [id] }).
import { Polar } from '@polar-sh/sdk'
import { planBySlug, PLANS } from '#shared/catalog'

interface PolarProductLite { id: string, name: string }

function polarClient(): Polar | null {
  const accessToken = useRuntimeConfig().polarAccessToken
  return accessToken ? new Polar({ accessToken, server: 'sandbox' }) : null
}

/** All non-archived Polar (sandbox) products. Empty when Polar is unconfigured. */
export async function polarListProducts(): Promise<PolarProductLite[]> {
  const polar = polarClient()
  if (!polar)
    return []
  const out: PolarProductLite[] = []
  const pager = await polar.products.list({ isArchived: false })
  for await (const page of pager) {
    const p = page as unknown as { result?: { items?: PolarProductLite[] }, items?: PolarProductLite[] }
    const items = p.result?.items ?? p.items ?? []
    for (const e of items) out.push({ id: e.id, name: e.name })
  }
  return out
}

/** catalog plan slug → Polar product id, for every plan that has a name-matching product. */
export async function polarProductMapByPlanSlug(): Promise<Record<string, string>> {
  const products = await polarListProducts()
  const byName = new Map(products.map(p => [p.name, p.id]))
  const map: Record<string, string> = {}
  for (const plan of PLANS) {
    const id = byName.get(plan.name)
    if (id)
      map[plan.slug] = id
  }
  return map
}

/** Resolve the Polar product id to check out for a given catalog plan slug. */
export async function polarProductIdForPlan(planSlug: string): Promise<string | null> {
  const plan = planBySlug(planSlug)
  if (!plan)
    return null
  const products = await polarListProducts()
  return products.find(p => p.name === plan.name)?.id ?? null
}

/** Webhook reverse lookup: Polar product_id → our catalog plan slug (by name). */
export async function polarPlanSlugForProduct(productId: string): Promise<string | null> {
  const products = await polarListProducts()
  const prod = products.find(p => p.id === productId)
  if (!prod)
    return null
  return PLANS.find(pl => pl.name === prod.name)?.slug ?? null
}

/** Is live Polar usable at all? (token present) */
export function isPolarConfigured(): boolean {
  return !!useRuntimeConfig().polarAccessToken
}
