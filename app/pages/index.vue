<script setup lang="ts">
import type { SubscriptionRow } from '#shared/subscription'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const subsApi = useSubscriptionsApi()

// better-auth client carries the session only in the browser → client-side only.
const { data: subs } = await useAsyncData('home-subscriptions', () => subsApi.list(), {
  default: () => [] as SubscriptionRow[],
  server: false,
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
            <h2 class="text-2xl font-semibold text-highlighted">
              Welcome 👋
            </h2>
            <p class="text-muted">
              Download apps, manage your billing and account settings.
            </p>
          </div>

          <SubscriptionExpiryBanner :subs="subs" />

          <div>
            <h3 class="text-sm font-medium text-muted mb-3">
              Products and services
            </h3>
            <div class="space-y-3">
              <SubscriptionProductCard v-for="s in subs" :key="s.id" :sub="s" />
              <div v-if="!subs.length" class="text-center text-muted py-8 text-sm">
                You don't have any products yet.
                <ULink to="/account/plans" class="text-primary">
                  Browse plans
                </ULink>.
              </div>
            </div>
          </div>
        </div>

        <aside class="space-y-6">
          <UCard>
            <h3 class="font-semibold text-highlighted">
              Account settings
            </h3>
            <p class="text-sm text-muted mt-1">
              Manage your account details, MFA, and notifications.
            </p>
            <UButton class="mt-3" variant="link" :padded="false" label="Manage account →" to="/account/profile" />
          </UCard>
          <UCard>
            <h3 class="font-semibold text-highlighted">
              Available plans
            </h3>
            <p class="text-sm text-muted mt-1">
              Explore and upgrade your protection.
            </p>
            <UButton class="mt-3" variant="link" :padded="false" label="View plans →" to="/account/plans" />
          </UCard>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
