<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import { planBySlug, plansForProduct, productBySlug } from '#shared/catalog'
import { isActive } from '#shared/subscription'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const product = computed(() => productBySlug(slug.value))
const plans = computed(() => plansForProduct(slug.value))
const subsApi = useSubscriptionsApi()
const billing = useBillingApi()
const toast = useToast()

const { data: subs } = await useAsyncData(`product-subs-${slug.value}`, () => subsApi.list(), {
  default: () => [] as SubscriptionRow[],
  server: false,
  watch: [slug],
})

// catalog plan slug → Polar product id (resolved live; checkout is per-product).
const { data: billingData } = await useAsyncData('billing-products', () => billing.products(), {
  default: () => ({ polarConfigured: false, products: {} as Record<string, string> }),
  server: false,
})

const owned = computed(() =>
  subs.value.filter(s => planBySlug(s.planSlug)?.productSlug === slug.value))
const familySub = computed(() => owned.value.find((s) => {
  const seats = planBySlug(s.planSlug)?.seats
  return seats !== undefined && seats > 1
}))
const familySeats = computed(() => familySub.value ? planBySlug(familySub.value.planSlug)!.seats : 0)

function ownedSub(planSlug: string) {
  return owned.value.find(s => s.planSlug === planSlug)
}
function productId(planSlug: string) {
  return billingData.value.products[planSlug]
}

const busy = ref<string | null>(null)
async function checkout(planSlug: string) {
  const id = productId(planSlug)
  if (!id) {
    toast.add({ title: 'This plan is not available for purchase right now', color: 'warning' })
    return
  }
  busy.value = planSlug
  try {
    const res = await billing.checkout(id) as { data?: { url?: string }, url?: string }
    const url = res?.data?.url ?? res?.url
    if (url)
      window.location.href = url // full-page redirect to Polar (CSP-safe)
  }
  catch (err) {
    toast.add({ title: (err as Error)?.message ?? 'Checkout failed', color: 'error' })
  }
  finally {
    busy.value = null
  }
}

function priceLabel(cents: number, currency: string, interval: string) {
  if (cents === 0)
    return 'Free'
  const amount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100)
  return interval === 'none' ? amount : `${amount}/${interval}`
}
</script>

<template>
  <UDashboardPanel :id="`product-${slug}`">
    <template #header>
      <DashboardNavbar :title="product?.name ?? 'Product'" />
    </template>
    <template #body>
      <div v-if="product" class="grid gap-6 lg:grid-cols-3">
        <div class="lg:col-span-2 space-y-6">
          <!-- Plans for this product: manage (active) / renew (expired) / buy (not owned). -->
          <UCard v-for="p in plans" :key="p.slug">
            <div class="flex items-center gap-4">
              <UIcon :name="product.icon" class="size-8" />
              <div class="flex-1 min-w-0">
                <p class="font-medium text-highlighted">
                  {{ p.name }}
                </p>
                <SubscriptionStatusBadge v-if="ownedSub(p.slug)" :sub="ownedSub(p.slug)!" />
                <p v-else class="text-sm text-muted">
                  {{ priceLabel(p.priceCents, p.currency, p.billingInterval) }}
                </p>
              </div>

              <UButton
                v-if="ownedSub(p.slug) && isActive(ownedSub(p.slug)!)"
                label="Manage plan" color="neutral" variant="subtle" to="/account/billing"
              />
              <UButton
                v-else-if="ownedSub(p.slug)"
                label="Renew" color="primary" :loading="busy === p.slug"
                :disabled="!productId(p.slug)" @click="checkout(p.slug)"
              />
              <UButton
                v-else-if="productId(p.slug)"
                :label="p.priceCents ? 'Get plan' : 'Activate'" color="primary"
                :loading="busy === p.slug" @click="checkout(p.slug)"
              />
            </div>
          </UCard>

          <SubscriptionFamilyMembers
            v-if="familySub"
            :subscription-id="familySub.id"
            :seats="familySeats"
          />

          <UAlert
            v-if="billingData.polarConfigured === false"
            color="warning" variant="subtle"
            title="Billing unavailable"
            description="Polar is not configured in this environment — purchases are disabled."
          />
        </div>

        <aside class="space-y-6">
          <UCard v-if="product.downloadUrl">
            <h3 class="font-semibold text-highlighted">
              Download {{ product.name }}
            </h3>
            <UButton class="mt-3 w-full" :to="product.downloadUrl" target="_blank" label="Get the app" icon="i-lucide-download" />
          </UCard>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
