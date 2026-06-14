<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import { planBySlug, productBySlug } from '#shared/catalog'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const route = useRoute()
const slug = computed(() => route.params.slug as string)
const product = computed(() => productBySlug(slug.value))
const subsApi = useSubscriptionsApi()

const { data: subs } = await useAsyncData(`product-subs-${slug.value}`, () => subsApi.list(), {
  default: () => [] as SubscriptionRow[],
  server: false,
  watch: [slug],
})

const owned = computed(() =>
  subs.value.filter(s => planBySlug(s.planSlug)?.productSlug === slug.value))
const familySub = computed(() => owned.value.find((s) => {
  const seats = planBySlug(s.planSlug)?.seats
  return seats !== undefined && seats > 1
}))
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
                <p class="font-medium text-highlighted">
                  {{ planBySlug(s.planSlug)?.name }}
                </p>
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
            <ULink :to="`/account/plans?product=${product.slug}`" class="text-primary">
              See plans
            </ULink>.
          </div>
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
