# Phase 06 — UI: the Nord Account portal

A new `subscription` Nuxt layer (frontend only — backend already centralized in
root `server/`) + the repurposed home page. Mirrors the existing layer pattern:
`nuxt.config.ts` with `$meta.name`, a `99.contribute.*.client.ts` nav plugin,
pages under `app/pages/`, components under `app/components/Subscription/`.

## Step 6.1 — `layers/subscription/nuxt.config.ts`

```ts
export default defineNuxtConfig({
  $meta: { name: 'subscription' },
})
```

## Step 6.2 — nav contribution `layers/subscription/app/plugins/99.contribute.subscription.client.ts`

```ts
export default defineNuxtPlugin(() => {
  const registry = useLayerRegistry()
  registry.contribute({
    navItems: [
      // Home (/) is the products dashboard — shown to members (non-admins).
      { id: 's-home', label: 'Home', icon: 'i-lucide-home', to: '/', section: 'main', priority: 5, role: 'member' },
      { id: 's-plans', label: 'Available plans', icon: 'i-lucide-sparkles', to: '/account/plans', section: 'main', priority: 50, role: 'member' },
      { id: 's-billing', label: 'Billing', icon: 'i-lucide-credit-card', to: '/account/billing', section: 'main', priority: 60, role: 'member' },
    ],
  })
})
```

> `useLayerRegistry().contribute({ navItems })` + the `RegistryNavItem` shape
> (`id/label/icon/to/section/priority/role`) are confirmed from
> `app/composables/useLayerRegistry.ts`. `section:'main'`, `role:'member'` match
> the auth/org layers. Adjust priorities so the order reads Home → Applications →
> Users → … → Plans → Billing.

## Step 6.3 — components `layers/subscription/app/components/Subscription/`

> Filenames start with their folder per CLAUDE.md hard rule #2 →
> `SubscriptionProductCard.vue`, `SubscriptionStatusBadge.vue`,
> `SubscriptionFamilyMembers.vue`, `SubscriptionExpiryBanner.vue`. Nuxt UI only;
> semantic tokens; `--ui-radius:0`.

### `SubscriptionStatusBadge.vue`
```vue
<script setup lang="ts">
import { isActive, formatPeriodEnd, type SubscriptionRow } from '#shared/subscription'

const props = defineProps<{ sub: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'> }>()
const active = computed(() => isActive(props.sub))
const label = computed(() => formatPeriodEnd(props.sub))
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="text-sm text-muted">{{ label }}</span>
    <UBadge v-if="!active" color="error" variant="subtle" size="sm">Expired</UBadge>
    <UBadge v-else-if="sub.cancelAtPeriodEnd" color="warning" variant="subtle" size="sm">Cancels</UBadge>
  </div>
</template>
```

### `SubscriptionProductCard.vue`
```vue
<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import { isActive, type CatalogProduct, type CatalogPlan } from '#shared/subscription'
import { productBySlug, planBySlug } from '#shared/catalog'

const props = defineProps<{ sub: SubscriptionRow }>()
const plan = computed<CatalogPlan | undefined>(() => planBySlug(props.sub.planSlug))
const product = computed<CatalogProduct | undefined>(() => plan.value ? productBySlug(plan.value.productSlug) : undefined)
const active = computed(() => isActive(props.sub))
</script>

<template>
  <ULink v-if="product" :to="`/account/products/${product.slug}`" class="block">
    <UCard class="hover:bg-elevated transition-colors">
      <div class="flex items-center gap-4">
        <UIcon :name="product.icon" :class="`size-8 text-${product.color}`" />
        <div class="flex-1 min-w-0">
          <p class="font-medium text-highlighted truncate">{{ plan?.name ?? product.name }}</p>
          <SubscriptionStatusBadge :sub="sub" />
        </div>
        <UButton
          v-if="!active" color="primary" size="sm" label="Renew subscription"
          :to="`/account/plans?product=${product.slug}`" @click.stop
        />
        <UIcon v-else name="i-lucide-chevron-right" class="size-5 text-muted" />
      </div>
    </UCard>
  </ULink>
</template>
```

> NOTE: re-export `CatalogProduct`/`CatalogPlan` types from `#shared/subscription`
> OR import them from `#shared/catalog` (cleaner). Use `import type { CatalogPlan,
> CatalogProduct } from '#shared/catalog'`. Tailwind dynamic class
> `text-${color}` must be safelisted — prefer a static map
> (`{ info: 'text-info', primary: 'text-primary', … }`) to survive purge.

### `SubscriptionExpiryBanner.vue`
```vue
<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import { isActive } from '#shared/subscription'
import { planBySlug, productBySlug } from '#shared/catalog'

const props = defineProps<{ subs: SubscriptionRow[] }>()
const expired = computed(() => props.subs.find(s => !isActive(s)))
const product = computed(() => {
  const p = expired.value ? planBySlug(expired.value.planSlug) : undefined
  return p ? productBySlug(p.productSlug) : undefined
})
</script>

<template>
  <UCard v-if="expired && product" class="bg-elevated">
    <div class="flex items-start gap-3">
      <UIcon :name="product.icon" class="size-6 text-error mt-1" />
      <div class="flex-1">
        <h3 class="text-lg font-semibold text-highlighted">Your {{ product.name }} subscription has expired</h3>
        <p class="text-muted text-sm">Renew now and stay protected online.</p>
        <UButton class="mt-3" color="primary" label="Renew" :to="`/account/plans?product=${product.slug}`" />
      </div>
    </div>
  </UCard>
</template>
```

### `SubscriptionFamilyMembers.vue`
```vue
<script setup lang="ts">
import type { FamilyMember } from '#shared/subscription' // see note: declare FamilyMember in shared

const props = defineProps<{ subscriptionId: string, seats: number }>()
const api = useFamilyApi()
const toast = useToast()
const members = ref<FamilyMember[]>([])
const email = ref('')
const busy = ref(false)

async function load() { members.value = await api.members(props.subscriptionId) }
onMounted(load)

async function add() {
  if (!email.value) return
  busy.value = true
  try { await api.add(props.subscriptionId, email.value); email.value = ''; await load() }
  catch (e: any) { toast.add({ title: e?.data?.statusMessage ?? 'Could not add member', color: 'error' }) }
  finally { busy.value = false }
}
async function remove(m: FamilyMember) {
  busy.value = true
  try { await api.remove(props.subscriptionId, m.id); await load() }
  catch (e: any) { toast.add({ title: e?.data?.statusMessage ?? 'Could not remove', color: 'error' }) }
  finally { busy.value = false }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-highlighted">Your family plan ({{ members.length }}/{{ seats }} members added)</h3>
      </div>
    </template>
    <div class="divide-y divide-default">
      <div v-for="m in members" :key="m.id" class="flex items-center gap-3 py-3">
        <UIcon name="i-lucide-user" class="size-5 text-muted" />
        <div class="flex-1 min-w-0">
          <p class="font-medium truncate">{{ m.email }}</p>
          <p class="text-xs text-muted capitalize">{{ m.status === 'owner' ? 'Plan owner' : m.status }}</p>
        </div>
        <UButton
          v-if="m.status !== 'owner'" color="error" variant="ghost" size="sm" label="Remove"
          :disabled="busy" @click="remove(m)"
        />
      </div>
    </div>
    <template v-if="members.length < seats" #footer>
      <form class="flex gap-2" @submit.prevent="add">
        <UInput v-model="email" type="email" placeholder="member@email.com" class="flex-1" required />
        <UButton type="submit" label="Add member" :loading="busy" />
      </form>
    </template>
  </UCard>
</template>
```

> **Declare `FamilyMember` in `#shared/subscription.ts`** (mirror the server
> service interface) so both client and server import the same type without
> crossing the server boundary. Add it in Phase 01 or here.

## Step 6.4 — repurpose `app/pages/index.vue` (the home dashboard)

Replace the whole file with the Nord home (products & services + sidebars). Keep
`server: false` data loading (CLAUDE.md hard rule #4) and the
`UDashboardPanel`/`DashboardNavbar` shell.

```vue
<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'
import type { SubscriptionRow } from '#shared/subscription'

const { user } = useUserSession()
const subsApi = useSubscriptionsApi()

const { data: subs } = await useAsyncData('home-subscriptions', () => subsApi.list(), {
  default: () => [] as SubscriptionRow[], server: false,
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <DashboardNavbar title="Home" />
    </template>
    <template #body>
      <div class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2 space-y-6">
          <div>
            <h2 class="text-2xl font-semibold text-highlighted">Welcome 👋</h2>
            <p class="text-muted">Download apps, manage your billing and account settings.</p>
          </div>

          <SubscriptionExpiryBanner :subs="subs" />

          <div>
            <h3 class="text-sm font-medium text-muted mb-3">Products and services</h3>
            <div class="space-y-3">
              <SubscriptionProductCard v-for="s in subs" :key="s.id" :sub="s" />
              <div v-if="!subs.length" class="text-center text-muted py-8 text-sm">
                You don't have any products yet.
                <ULink to="/account/plans" class="text-primary">Browse plans</ULink>.
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <UCard>
            <h3 class="font-semibold text-highlighted">Account settings</h3>
            <p class="text-sm text-muted mt-1">Manage your account details, MFA, and notifications.</p>
            <UButton class="mt-3" variant="link" :padded="false" label="Manage account →" to="/account/profile" />
          </UCard>
          <UCard>
            <h3 class="font-semibold text-highlighted">Available plans</h3>
            <p class="text-sm text-muted mt-1">Explore and upgrade your protection.</p>
            <UButton class="mt-3" variant="link" :padded="false" label="View plans →" to="/account/plans" />
          </UCard>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
```

> The previous index.vue showed orgs + admin stats. That content is **not lost** —
> sysadmins still reach `/platform/*`; if you want an admin-only stat strip, wrap
> it in `v-if="user?.role === 'admin'"`. Keep the home product-first for members
> (the Nord experience). Acceptable to keep a small admin section below.

## Step 6.5 — `layers/subscription/app/pages/account/products/[slug].vue`

```vue
<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'
import type { SubscriptionRow } from '#shared/subscription'
import { productBySlug, plansForProduct, planBySlug } from '#shared/catalog'

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const product = computed(() => productBySlug(slug.value))
const subsApi = useSubscriptionsApi()

const { data: subs } = await useAsyncData(() => `product-subs-${slug.value}`, () => subsApi.list(), {
  default: () => [] as SubscriptionRow[], server: false, watch: [slug],
})

const owned = computed(() =>
  subs.value.filter(s => planBySlug(s.planSlug)?.productSlug === slug.value))
const familySub = computed(() => owned.value.find(s => planBySlug(s.planSlug)?.seats && planBySlug(s.planSlug)!.seats > 1))
const familySeats = computed(() => familySub.value ? planBySlug(familySub.value.planSlug)!.seats : 0)
</script>

<template>
  <UDashboardPanel :id="`product-${slug}`">
    <template #header>
      <DashboardNavbar :title="product?.name ?? 'Product'" />
    </template>
    <template #body>
      <div v-if="product" class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2 space-y-6">
          <UCard v-for="s in owned" :key="s.id">
            <div class="flex items-center gap-4">
              <UIcon :name="product.icon" class="size-8" />
              <div class="flex-1">
                <p class="font-medium text-highlighted">{{ planBySlug(s.planSlug)?.name }}</p>
                <SubscriptionStatusBadge :sub="s" />
              </div>
              <UButton label="Manage plan" color="primary" to="/account/billing" />
            </div>
          </UCard>

          <SubscriptionFamilyMembers
            v-if="familySub"
            :subscription-id="familySub.id"
            :seats="familySeats"
          />

          <div v-if="!owned.length" class="text-muted text-sm">
            You don't own {{ product.name }} yet.
            <ULink :to="`/account/plans?product=${product.slug}`" class="text-primary">See plans</ULink>.
          </div>
        </div>

        <aside class="space-y-6">
          <UCard v-if="product.downloadUrl">
            <h3 class="font-semibold text-highlighted">Download {{ product.name }}</h3>
            <UButton class="mt-3 w-full" :to="product.downloadUrl" target="_blank" label="Get the app" icon="i-lucide-download" />
          </UCard>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
```

## Step 6.6 — `layers/subscription/app/pages/account/plans.vue`

```vue
<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'
import { PLANS, productBySlug } from '#shared/catalog'

const billing = useBillingApi()
const toast = useToast()
const { data: cfg } = await useAsyncData('billing-config', () => billing.config(), {
  default: () => ({ polarConfigured: false }), server: false,
})
const busy = ref<string | null>(null)

async function checkout(slug: string) {
  if (!cfg.value.polarConfigured) {
    toast.add({ title: 'Billing is not configured', color: 'warning' })
    return
  }
  busy.value = slug
  try {
    const res: any = await billing.checkout(slug)
    const url = res?.data?.url ?? res?.url
    if (url) window.location.href = url // full-page redirect to Polar (CSP-safe)
  }
  catch (e: any) { toast.add({ title: e?.message ?? 'Checkout failed', color: 'error' }) }
  finally { busy.value = null }
}

function price(cents: number, currency: string) {
  return cents === 0 ? 'Free' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
}
</script>

<template>
  <UDashboardPanel id="plans">
    <template #header>
      <DashboardNavbar title="Available plans" />
    </template>
    <template #body>
      <UAlert
        v-if="!cfg.polarConfigured" color="warning" variant="subtle" class="mb-6"
        title="Billing unavailable" description="Polar is not configured in this environment — checkout is disabled."
      />
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UCard v-for="p in PLANS" :key="p.slug">
          <div class="flex items-center gap-3">
            <UIcon :name="productBySlug(p.productSlug)?.icon ?? 'i-lucide-box'" class="size-6" />
            <h3 class="font-semibold text-highlighted">{{ p.name }}</h3>
          </div>
          <p class="text-2xl font-semibold mt-3">
            {{ price(p.priceCents, p.currency) }}
            <span v-if="p.billingInterval !== 'none' && p.priceCents" class="text-sm text-muted font-normal">/{{ p.billingInterval }}</span>
          </p>
          <ul class="mt-3 space-y-1 text-sm text-muted">
            <li v-for="f in p.features" :key="f" class="flex gap-2">
              <UIcon name="i-lucide-check" class="size-4 text-success mt-0.5" />{{ f }}
            </li>
          </ul>
          <UButton
            class="mt-4 w-full" color="primary" :label="p.priceCents ? 'Get plan' : 'Activate'"
            :loading="busy === p.slug" :disabled="!cfg.polarConfigured" @click="checkout(p.slug)"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
```

## Step 6.7 — `layers/subscription/app/pages/account/billing.vue`

```vue
<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const billing = useBillingApi()
const toast = useToast()
const { data: cfg } = await useAsyncData('billing-config-2', () => billing.config(), {
  default: () => ({ polarConfigured: false }), server: false,
})

async function openPortal() {
  try {
    const res: any = await billing.portal()
    const url = res?.data?.url ?? res?.url
    if (url) window.location.href = url
  }
  catch (e: any) { toast.add({ title: e?.message ?? 'Could not open portal', color: 'error' }) }
}
</script>

<template>
  <UDashboardPanel id="billing">
    <template #header>
      <DashboardNavbar title="Billing" />
    </template>
    <template #body>
      <UCard>
        <h3 class="font-semibold text-highlighted">Payment & invoices</h3>
        <p class="text-sm text-muted mt-1">Manage your payment method, invoices and subscriptions in the secure Polar portal.</p>
        <UButton
          class="mt-4" color="primary" label="Open billing portal" icon="i-lucide-external-link"
          :disabled="!cfg.polarConfigured" @click="openPortal"
        />
        <p v-if="!cfg.polarConfigured" class="text-xs text-warning mt-2">Billing is not configured in this environment.</p>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
```

> Order-history table (via `billing.orders()`) is optional polish — add a `UTable`
> bound to `customer.orders.list` once live Polar data exists. Not required for
> acceptance.

## Verify (Phase 06 done)

```bash
pnpm lint                    # clean
pnpm exec nuxi typecheck     # 0
```
**Browser walk (Chrome DevTools MCP), signed in as alice@seed.local:**
1. `/` → "Welcome", expired banner for NordVPN, 5 product cards with correct
   statuses (NordVPN/Dark Web Monitor Expired; NordPass Premium "Renews on
   October 3, 2027"; NordPass Family "Renews on September 14, 2027"; NordLocker
   Free).
2. Click NordPass card → `/account/products/nordpass` → shows Premium + Family;
   Family card shows **6/6 members**. Remove one → 5/6. Add an email → 6/6; add
   a 7th → toast "All seats are taken" (409).
3. `/account/plans` → 5 plan cards; checkout button disabled with the "Billing
   unavailable" alert when Polar unset, or redirects to Polar sandbox when set.
4. `/account/billing` → "Open billing portal" (disabled/enabled per config).
5. Sidebar nav shows Home / Available plans / Billing under the member IA.

**Full acceptance:** run all four proof scripts + typecheck + lint, then the
browser walk. The plan is complete when `plan.md`'s acceptance checklist is all ✓.
