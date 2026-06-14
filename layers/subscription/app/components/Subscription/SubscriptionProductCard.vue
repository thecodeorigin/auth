<script setup lang="ts">
import type { CatalogPlan, CatalogProduct } from '#shared/catalog'
import type { SubscriptionRow } from '#shared/subscription'
import { planBySlug, productBySlug } from '#shared/catalog'
import { isActive } from '#shared/subscription'

const props = defineProps<{ sub: SubscriptionRow }>()
const plan = computed<CatalogPlan | undefined>(() => planBySlug(props.sub.planSlug))
const product = computed<CatalogProduct | undefined>(() => plan.value ? productBySlug(plan.value.productSlug) : undefined)
const active = computed(() => isActive(props.sub))

// Static map so Tailwind purge keeps these classes (dynamic `text-${color}` would be stripped).
const ICON_COLOR: Record<CatalogProduct['color'], string> = {
  primary: 'text-primary',
  success: 'text-success',
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  neutral: 'text-muted',
}
</script>

<template>
  <ULink v-if="product" :to="`/account/products/${product.slug}`" class="block">
    <UCard class="hover:bg-elevated transition-colors">
      <div class="flex items-center gap-4">
        <UIcon :name="product.icon" :class="`size-8 ${ICON_COLOR[product.color]}`" />
        <div class="flex-1 min-w-0">
          <p class="font-medium text-highlighted truncate">
            {{ plan?.name ?? product.name }}
          </p>
          <SubscriptionStatusBadge :sub="sub" />
        </div>
        <UButton
          v-if="!active && (plan?.priceCents ?? 0) > 0" color="primary" size="sm" label="Renew subscription"
          :to="`/account/products/${product.slug}`" @click.stop
        />
        <UIcon v-else name="i-lucide-chevron-right" class="size-5 text-muted" />
      </div>
    </UCard>
  </ULink>
</template>
