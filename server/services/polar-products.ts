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

// Polar validates email deliverability (real TLD + MX), so it rejects seeded
// demo addresses like @seed.local. Swap such domains for the project's real
// sending domain (from runtimeConfig.emailFrom — it has MX). The customer is
// keyed on externalId (= our userId), so this email is only metadata.
const RESERVED_TLDS = new Set(['local', 'localhost', 'test', 'invalid', 'example'])
function polarSafeEmail(email: string): string {
  const fromDomain = (useRuntimeConfig().emailFrom || 'noreply@thecodeorigin.com').split('@').pop() || 'thecodeorigin.com'
  const at = email.lastIndexOf('@')
  if (at === -1)
    return `${email}@${fromDomain}`
  const tld = email.slice(at + 1).split('.').pop()?.toLowerCase()
  return tld && RESERVED_TLDS.has(tld) ? `${email.slice(0, at)}@${fromDomain}` : email
}

/**
 * Ensure a Polar customer exists for our user (keyed on externalId = our userId).
 * createCustomerOnSignUp only covers NEW sign-ups, so seeded/older users have no
 * Polar customer — without this the portal API 500s ("Customer does not exist").
 * Idempotent: no-op when the customer already exists.
 */
export async function polarEnsureCustomer(userId: string, email: string, name?: string): Promise<void> {
  const polar = polarClient()
  if (!polar)
    return
  try {
    await polar.customers.getExternal({ externalId: userId })
    return // already a customer
  }
  catch {
    // not found → create below
  }
  try {
    await polar.customers.create({ email: polarSafeEmail(email), externalId: userId, name: name || email })
  }
  catch (error) {
    // tolerate races / "already exists" — the session create below will still work
    console.warn('[billing] polarEnsureCustomer: create skipped', userId, error)
  }
}

/** Set a real Polar subscription's seat count (charges/credits proration). Returns the new seat count, or null if Polar is unconfigured or the call fails. */
export async function polarSetSeats(polarSubscriptionId: string, seats: number): Promise<number | null> {
  const polar = polarClient()
  if (!polar)
    return null
  try {
    const updated = await polar.subscriptions.update({
      id: polarSubscriptionId,
      subscriptionUpdate: { seats },
    })
    return updated.seats ?? seats
  }
  catch (error) {
    console.error('[billing] polarSetSeats failed', polarSubscriptionId, seats, error)
    return null
  }
}

/** Ensure the customer exists, then mint a Polar customer-portal session URL. */
export async function polarPortalUrl(userId: string, email: string, name?: string): Promise<string | null> {
  const polar = polarClient()
  if (!polar)
    return null
  await polarEnsureCustomer(userId, email, name)
  const session = await polar.customerSessions.create({ externalCustomerId: userId })
  return session.customerPortalUrl
}
