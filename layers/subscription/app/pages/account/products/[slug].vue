<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import { isFreemium, planBySlug, productBySlug, productPrimaryPaidPlan } from '#shared/catalog'
import { isActive } from '#shared/subscription'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface PolarRedirect { data?: { url?: string }, error?: { message?: string } | null }

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const product = computed(() => productBySlug(slug.value))
const { user } = useUserSession()
const subsApi = useSubscriptionsApi()
const billing = useBillingApi()
const toast = useToast()

const { data: subs, refresh: refreshSubs } = await useAsyncData(`product-subs-${slug.value}`, () => subsApi.list(), {
  default: () => [] as SubscriptionRow[],
  server: false,
  watch: [slug],
})
const { data: billingData } = await useAsyncData('billing-products', () => billing.products(), {
  default: () => ({ polarConfigured: false, products: {} as Record<string, string> }),
  server: false,
})

// Resolve the subscription backing this product: prefer an active paid sub
// (Polar-backed first), else any active sub, else the newest.
const owned = computed(() => subs.value
  .filter(s => planBySlug(s.planSlug)?.productSlug === slug.value)
  .sort((a, b) => b.createdAt - a.createdAt))
const paidSub = computed(() => owned.value
  .filter(s => isActive(s) && (planBySlug(s.planSlug)?.priceCents ?? 0) > 0)
  .sort((a, b) => Number(b.source === 'polar') - Number(a.source === 'polar'))[0])
const freeSub = computed(() => owned.value.find(s => (planBySlug(s.planSlug)?.priceCents ?? 0) === 0))
const activeSub = computed(() => paidSub.value ?? freeSub.value ?? null)

const tier = computed<'paid' | 'free' | 'none'>(() =>
  paidSub.value ? 'paid' : (freeSub.value || isFreemium(slug.value)) ? 'free' : 'none')
const activePlan = computed(() => activeSub.value ? planBySlug(activeSub.value.planSlug) : undefined)
const seatCapable = computed(() => (activePlan.value?.seats ?? 1) > 1)

// Manage-plan card
const paidPlan = computed(() => productPrimaryPaidPlan(slug.value))
const buyProductId = computed(() => paidPlan.value ? billingData.value.products[paidPlan.value.slug] : undefined)
const buyDisabled = computed(() => !billingData.value.polarConfigured || !buyProductId.value)
const busy = ref(false)

async function buy() {
  if (!buyProductId.value)
    return
  busy.value = true
  try {
    const { data, error } = await billing.checkout(buyProductId.value) as PolarRedirect
    if (error)
      throw new Error(error.message ?? 'Checkout failed')
    if (data?.url)
      window.location.href = data.url
  }
  catch (err) {
    toast.add({ title: (err as Error)?.message ?? 'Checkout failed', color: 'error' })
  }
  finally {
    busy.value = false
  }
}
async function manage() {
  busy.value = true
  try {
    const { url } = await billing.portal()
    if (url)
      window.location.href = url
    else
      throw new Error('Billing portal is unavailable')
  }
  catch (err) {
    const msg = (err as { data?: { statusMessage?: string } })?.data?.statusMessage ?? (err as Error)?.message ?? 'Could not open the billing portal'
    toast.add({ title: msg, color: 'error' })
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <UDashboardPanel :id="`product-${slug}`">
    <template #header>
      <DashboardNavbar :title="product?.name ?? 'Product'" />
    </template>
    <template #body>
      <div v-if="product" class="space-y-6 max-w-3xl">
        <!-- Card 1: Go to product (only when the product has an external app) -->
        <UCard v-if="product.appUrl">
          <div class="flex items-start gap-4">
            <UIcon :name="product.icon" class="size-8 text-primary shrink-0 mt-1" />
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-highlighted">
                {{ product.name }}
              </h3>
              <p class="text-sm text-muted mt-1">
                {{ product.description }}
              </p>
            </div>
            <UButton
              :to="product.appUrl" target="_blank" color="primary" variant="subtle"
              label="Go to product" trailing-icon="i-lucide-external-link"
            />
          </div>
        </UCard>

        <!-- Card 2: Manage plan -->
        <UCard>
          <div class="flex items-center justify-between gap-4">
            <div>
              <h3 class="font-semibold text-highlighted">
                Plan
              </h3>
              <p class="text-sm text-muted mt-1">
                <template v-if="tier === 'paid'">
                  {{ activePlan?.name }} — active
                </template>
                <template v-else-if="tier === 'free'">
                  Free plan active
                </template>
                <template v-else>
                  No active plan
                </template>
              </p>
            </div>
            <UButton
              v-if="tier === 'paid'" label="Manage plan" color="neutral" variant="subtle"
              :loading="busy" @click="manage"
            />
            <UButton
              v-else-if="paidPlan" :label="tier === 'free' ? 'Upgrade' : 'Buy now'" color="primary"
              :loading="busy" :disabled="buyDisabled" @click="buy"
            />
          </div>
          <p v-if="tier !== 'paid' && paidPlan && buyDisabled" class="text-xs text-warning mt-2">
            Purchasing is unavailable in this environment.
          </p>
        </UCard>

        <!-- Card 3: Members (only when subscribed) -->
        <SubscriptionMembersCard
          v-if="tier !== 'none'"
          :subscription-id="activeSub?.id ?? null"
          :owner-email="user?.email ?? ''"
          :seats="activeSub?.seats ?? 1"
          :can-add-seat="tier === 'paid' && seatCapable"
          :upgrade-hint="tier === 'free' && !!paidPlan"
          @changed="refreshSubs"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
