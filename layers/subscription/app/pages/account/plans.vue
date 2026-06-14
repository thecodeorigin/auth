<script setup lang="ts">
import { PLANS, productBySlug } from '#shared/catalog'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const billing = useBillingApi()
const toast = useToast()
const { data: cfg } = await useAsyncData('billing-config', () => billing.config(), {
  default: () => ({ polarConfigured: false }),
  server: false,
})
const busy = ref<string | null>(null)

async function checkout(slug: string) {
  if (!cfg.value.polarConfigured) {
    toast.add({ title: 'Billing is not configured', color: 'warning' })
    return
  }
  busy.value = slug
  try {
    const res = await billing.checkout(slug) as { data?: { url?: string }, url?: string }
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
            <h3 class="font-semibold text-highlighted">
              {{ p.name }}
            </h3>
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
