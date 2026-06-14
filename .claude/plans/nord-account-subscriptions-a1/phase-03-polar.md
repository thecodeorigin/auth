# Phase 03 — Polar full live integration

Wire the already-present `polar({ client })` into a full integration: checkout +
portal + webhooks + usage subplugins, `createCustomerOnSignUp`, the client
plugin, env, and the webhook→local-sync. Local seed/proofs stay offline-valid;
live checkout needs the 4 sandbox product IDs.

## Step 3.1 — `server/services/polar-products.ts` (env-driven product map)

```ts
// Server-only. Maps our plan slugs ⇄ Polar sandbox product IDs (from env), and
// builds the checkout product list. Real product IDs never reach the client.

interface PolarProductLink { planSlug: string, productId: string }

function links(): PolarProductLink[] {
  const rc = useRuntimeConfig()
  const raw: Array<[string, string]> = [
    ['nordvpn-complete', rc.polarProductNordvpn],
    ['nordpass-premium', rc.polarProductNordpassPremium],
    ['nordpass-family', rc.polarProductNordpassFamily],
    ['nordlocker-free', rc.polarProductNordlocker],
    // dark-web-monitor is bundled / not separately purchasable → no Polar product.
  ]
  return raw.filter(([, id]) => !!id).map(([planSlug, productId]) => ({ planSlug, productId }))
}

/** For checkout({ products }): [{ productId, slug }] where slug = our plan slug. */
export function polarCheckoutProducts(): Array<{ productId: string, slug: string }> {
  return links().map(l => ({ productId: l.productId, slug: l.planSlug }))
}

/** Webhook reverse lookup: Polar product_id → our plan slug. */
export function polarPlanSlugForProduct(productId: string): string | null {
  return links().find(l => l.productId === productId)?.planSlug ?? null
}

/** Is live Polar usable at all? (token present) */
export function isPolarConfigured(): boolean {
  return !!useRuntimeConfig().polarAccessToken
}
```

> `useRuntimeConfig()` is available in Nitro service scope (auto-imported). These
> read server-only keys added in Step 3.4.

## Step 3.2 — `server/auth.config.ts`: full Polar plugin

Add imports near the top (file already imports `checkout, polar, portal, usage, webhooks`):

```ts
import { subscriptionUpsertFromPolar, subscriptionClearForUser } from './services/subscription'
import { polarCheckoutProducts } from './services/polar-products'
```

Replace the bare `polar({ client: polarClient })` (lines ~144–146) with:

```ts
polar({
  client: polarClient,
  createCustomerOnSignUp: true,
  // Bind the Polar customer to our user id so webhooks resolve back to a user.
  getCustomerCreateParams: ({ user }) => ({ metadata: { userId: user.id } }),
  use: [
    checkout({
      products: polarCheckoutProducts(), // [] when no sandbox IDs set → checkout disabled, no crash
      successUrl: `${baseURL}/account/billing?checkout_id={CHECKOUT_ID}`,
      authenticatedUsersOnly: true,
    }),
    portal(),
    usage(),
    webhooks({
      secret: runtimeConfig.polarWebhookSecret,
      onSubscriptionCreated: p => subscriptionUpsertFromPolar(p.data as never),
      onSubscriptionUpdated: p => subscriptionUpsertFromPolar(p.data as never),
      onSubscriptionActive: p => subscriptionUpsertFromPolar(p.data as never),
      onSubscriptionCanceled: p => subscriptionUpsertFromPolar(p.data as never),
      onSubscriptionRevoked: p => subscriptionUpsertFromPolar(p.data as never),
      onSubscriptionUncanceled: p => subscriptionUpsertFromPolar(p.data as never),
    }),
  ],
}),
```

> - `polarCheckoutProducts()` is `[]` until sandbox IDs are in `.env`. Confirm the
>   checkout subplugin accepts an empty list without throwing at setup; if it
>   throws on empty, guard: `...(products.length ? [checkout({...})] : [])`.
> - The webhook payload shape (`p.data`) — verify against `@polar-sh/better-auth`
>   types; `subscriptionUpsertFromPolar` reads `id/status/current_period_end/
>   product_id/customer.external_id/metadata`. Adjust field access to the real
>   payload (snake_case per Polar SDK). The `as never` casts are placeholders —
>   replace with the real payload type from the package.
> - `getCustomerCreateParams` metadata.userId is what `subscriptionUpsertFromPolar`
>   falls back to; also pass `{ metadata: { userId, planSlug } }` at **checkout**
>   time (Step 3.5) so the subscription object carries both.

## Step 3.3 — `app/auth.config.ts`: client plugin

```ts
import { polarClient } from '@polar-sh/better-auth/client'
// …
export default defineClientAuth({
  plugins: [
    adminClient(),
    organizationClient({ ac, roles, dynamicAccessControl: { enabled: true } }),
    apiKeyClient(),
    oauthProviderClient(),
    polarClient(),
  ],
})
```

This exposes `authClient.checkout(...)`, `authClient.customer.portal()`,
`authClient.customer.state()`, `authClient.customer.subscriptions.list(...)`.

## Step 3.4 — `nuxt.config.ts` runtimeConfig + routeRule

Add to `runtimeConfig` (server-only — NOT under `public`):

```ts
runtimeConfig: {
  // …existing…
  polarAccessToken: '',          // already present
  polarWebhookSecret: '',        // NEW
  polarProductNordvpn: '',       // NEW — Polar sandbox product IDs
  polarProductNordpassPremium: '',
  polarProductNordpassFamily: '',
  polarProductNordlocker: '',
  public: {
    siteUrl: '',
    // polarConfigured is exposed at runtime via /api/billing/config (Step 5),
    // not here, to avoid leaking the token's presence into the static client bundle? It's only a boolean — acceptable either way. Keep server route for symmetry with isPolarConfigured().
  },
},
```

**Webhook routeRule:** the Polar plugin mounts under the better-auth base path.
Confirm the exact path (likely `/api/auth/polar/webhooks`) by listing routes
(`pnpm dev` logs, or hit `/api/auth/reference` OpenAPI). It already falls under
the existing `'/api/**': { security: { csrf: false } }` and `'/api/auth/**'`
rules — **no CSP/CSRF change needed**. If (and only if) the plugin mounts at a
top-level `/polar/**`, add:

```ts
routeRules: {
  // …existing…
  '/polar/**': { security: { csrf: false, xssValidator: false } },
},
```

> Webhook signature is verified by the `webhooks()` subplugin via
> `polarWebhookSecret` — do not add custom auth. CSRF must be off (external POST).

## Step 3.5 — checkout metadata (carry userId + planSlug)

The UI checkout call (Phase 06 plans page) must pass metadata so the webhook can
resolve the row even before `customer.state` settles:

```ts
// In useBillingApi (Phase 05) / plans page:
await authClient.checkout({
  slug,                                   // our plan slug, mapped to productId server-side
  // referenceId omitted — server derives userId from session; do NOT accept from client
})
```

> better-auth `checkout` maps `slug`→`productId` from the server `products` list,
> and `createCustomerOnSignUp` + `getCustomerCreateParams` already stamps
> `metadata.userId` on the customer. If the **subscription** object doesn't
> inherit customer metadata, set subscription metadata in the Polar product/price
> config or rely on `customer.external_id` (= userId) — `subscriptionUpsertFromPolar`
> already falls back to `customer.external_id`. planSlug falls back to
> `polarPlanSlugForProduct(product_id)`. **Both fallbacks exist**, so checkout
> needs no client-supplied metadata. Good.

## Step 3.6 — `.env.example` (create or append)

```bash
# Polar (sandbox) — https://sandbox.polar.sh
NUXT_POLAR_ACCESS_TOKEN=polar_oat_...
NUXT_POLAR_WEBHOOK_SECRET=whsec_...
NUXT_POLAR_PRODUCT_NORDVPN=prod_...
NUXT_POLAR_PRODUCT_NORDPASS_PREMIUM=prod_...
NUXT_POLAR_PRODUCT_NORDPASS_FAMILY=prod_...
NUXT_POLAR_PRODUCT_NORDLOCKER=prod_...
```

> Nuxt maps `NUXT_POLAR_ACCESS_TOKEN` → `runtimeConfig.polarAccessToken`, etc.
> (camelCase). Confirm the existing token is supplied this way.

## Verify (Phase 03 done)

```bash
pnpm exec nuxi typecheck       # 0
pnpm dev                       # boots WITHOUT a Polar token set (empty products → no crash)
```
- **Offline:** with no token, app boots, seed + all proofs still pass. Checkout
  routes will 503 (Phase 05 guard) — acceptable.
- **Live (if sandbox IDs provided):** create the 4 products in the Polar sandbox,
  set `.env`, restart. Register the webhook URL (your tunnel) →
  `…/api/auth/polar/webhooks` with `polarWebhookSecret`. A sandbox checkout
  produces a `subscription` row (`source='polar'`); re-delivering the webhook
  produces **no duplicate** (UNIQUE + staleness guard). Verify in D1.
