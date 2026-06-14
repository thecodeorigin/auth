<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import { formatPeriodEnd, isActive } from '#shared/subscription'

const props = defineProps<{ sub: Pick<SubscriptionRow, 'status' | 'currentPeriodEnd' | 'cancelAtPeriodEnd'> }>()
const active = computed(() => isActive(props.sub))
const label = computed(() => formatPeriodEnd(props.sub))
</script>

<template>
  <div class="flex items-center gap-2">
    <span class="text-sm text-muted">{{ label }}</span>
    <UBadge v-if="!active" color="error" variant="subtle" size="sm">
      Expired
    </UBadge>
    <UBadge v-else-if="sub.cancelAtPeriodEnd" color="warning" variant="subtle" size="sm">
      Cancels
    </UBadge>
  </div>
</template>
