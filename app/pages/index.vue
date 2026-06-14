<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface OrgRow { id: string, name: string, slug: string }

const { user } = useUserSession()
const orgApi = useOrgApi()
const usersApi = useUsersApi()
const isAdmin = computed(() => user.value?.role === 'admin')

// better-auth client carries the session only in the browser, so these run
// client-side (SSR has no cookie on the better-fetch client).
const { data: orgs } = await useAsyncData('home-orgs', async () => {
  const { data } = await orgApi.list()
  return (data ?? []) as OrgRow[]
}, { default: () => [], server: false })

const { data: totalUsers } = await useAsyncData('home-total-users', async () => {
  if (!isAdmin.value)
    return null
  const { data } = await usersApi.list({ limit: 1 })
  return data?.total ?? null
}, { default: () => null, server: false, watch: [isAdmin] })

const quickActions = [
  { label: 'Create API Key', icon: 'i-lucide-key', to: '/account/api-keys/new' },
  { label: 'Edit Profile', icon: 'i-lucide-user', to: '/account/profile' },
  { label: 'Security', icon: 'i-lucide-shield', to: '/account/security' },
  { label: 'Authorized Apps', icon: 'i-lucide-layout-grid', to: '/account/authorized-apps' },
]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <DashboardNavbar title="Home" />
    </template>

    <template #body>
      <div class="space-y-6">
        <div>
          <h2 class="text-xl font-semibold text-highlighted">
            Welcome back, {{ user?.name || user?.email }}
          </h2>
          <p class="text-muted">
            Manage your account, organizations and applications from here.
          </p>
        </div>

        <div v-if="isAdmin" class="grid gap-4 sm:grid-cols-3">
          <UCard>
            <p class="text-sm text-muted">
              Total users
            </p>
            <p class="text-2xl font-semibold text-highlighted">
              {{ totalUsers ?? '—' }}
            </p>
          </UCard>
        </div>

        <div class="grid gap-6 lg:grid-cols-2">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <h3 class="font-semibold text-highlighted">
                  My organizations
                </h3>
              </div>
            </template>
            <div v-if="orgs.length" class="divide-y divide-default">
              <ULink
                v-for="org in orgs.slice(0, 5)"
                :key="org.id"
                :to="`/orgs/${org.slug}`"
                class="flex items-center gap-3 py-2 hover:text-primary"
              >
                <UIcon name="i-lucide-building" class="size-4 text-muted" />
                <span class="font-medium">{{ org.name }}</span>
              </ULink>
            </div>
            <div v-else class="text-center text-muted py-6 text-sm">
              You're not in any organizations yet.
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h3 class="font-semibold text-highlighted">
                Quick actions
              </h3>
            </template>
            <div class="flex flex-col">
              <UButton
                v-for="action in quickActions"
                :key="action.to"
                :icon="action.icon"
                :label="action.label"
                :to="action.to"
                variant="ghost"
                class="justify-start"
              />
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
