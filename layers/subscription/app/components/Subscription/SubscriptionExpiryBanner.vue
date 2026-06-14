<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import { planBySlug, productBySlug } from '#shared/catalog'
import { isActive } from '#shared/subscription'

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
        <h3 class="text-lg font-semibold text-highlighted">
          Your {{ product.name }} subscription has expired
        </h3>
        <p class="text-muted text-sm">
          Renew now and stay protected online.
        </p>
        <UButton class="mt-3" color="primary" label="Renew" :to="`/account/products/${product.slug}`" />
      </div>
    </div>
  </UCard>
</template>
