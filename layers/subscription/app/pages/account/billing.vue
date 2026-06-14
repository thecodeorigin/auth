<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const billing = useBillingApi()
const toast = useToast()
const { data: cfg } = await useAsyncData('billing-config-2', () => billing.config(), {
  default: () => ({ polarConfigured: false }),
  server: false,
})

async function openPortal() {
  try {
    const res = await billing.portal() as { data?: { url?: string }, url?: string }
    const url = res?.data?.url ?? res?.url
    if (url)
      window.location.href = url
  }
  catch (err) {
    toast.add({ title: (err as Error)?.message ?? 'Could not open portal', color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="billing">
    <template #header>
      <DashboardNavbar title="Billing" />
    </template>
    <template #body>
      <UCard>
        <h3 class="font-semibold text-highlighted">
          Payment & invoices
        </h3>
        <p class="text-sm text-muted mt-1">
          Manage your payment method, invoices and subscriptions in the secure Polar portal.
        </p>
        <UButton
          class="mt-4" color="primary" label="Open billing portal" icon="i-lucide-external-link"
          :disabled="!cfg.polarConfigured" @click="openPortal"
        />
        <p v-if="!cfg.polarConfigured" class="text-xs text-warning mt-2">
          Billing is not configured in this environment.
        </p>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
