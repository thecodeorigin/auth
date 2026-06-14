<script setup lang="ts">
import { PLANS, productBySlug } from '#shared/catalog'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

// Browse-only overview. Checkout is per-product and lives on the product detail
// page (/account/products/[slug]) — each card links there.
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
            class="mt-4 w-full" color="primary" variant="soft" label="View product"
            trailing-icon="i-lucide-arrow-right" :to="`/account/products/${p.productSlug}`"
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
