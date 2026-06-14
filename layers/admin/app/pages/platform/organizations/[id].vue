<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

interface Member { id: string, userId: string, role: string, user?: { name?: string | null, email?: string | null } }
interface FullOrg { id: string, name: string, slug: string, members?: Member[] }

const route = useRoute()
const orgApi = useOrgApi()
const id = computed(() => String(route.params.id))

const { data: org, pending, error } = await useAsyncData(
  () => `platform-org-${id.value}`,
  async () => {
    const { data, error: e } = await orgApi.getFull({ organizationId: id.value })
    if (e)
      throw new Error(e.message ?? 'Organization not accessible')
    return data as FullOrg
  },
  { server: false },
)

const members = computed(() => org.value?.members ?? [])
</script>

<template>
  <UDashboardPanel id="platform-org-detail">
    <template #header>
      <DashboardNavbar :title="org?.name ?? 'Organization'">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" variant="ghost" to="/platform/organizations" aria-label="Back" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div v-if="pending" class="max-w-3xl">
        <USkeleton class="h-40 w-full" />
      </div>

      <UAlert
        v-else-if="error"
        color="warning"
        variant="soft"
        icon="i-lucide-info"
        title="Limited access"
        :description="`${error.message}. Cross-tenant org administration requires a dedicated admin endpoint.`"
      />

      <div v-else class="space-y-6 max-w-4xl">
        <div class="grid gap-4 sm:grid-cols-3">
          <UCard>
            <p class="text-sm text-muted">
              Slug
            </p>
            <p class="font-mono text-highlighted">
              {{ org?.slug }}
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Members
            </p>
            <p class="text-2xl font-semibold text-highlighted">
              {{ members.length }}
            </p>
          </UCard>
        </div>

        <UCard :ui="{ body: 'sm:p-0' }">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Members
            </h2>
          </template>
          <div class="divide-y divide-default">
            <div v-for="m in members" :key="m.id" class="flex items-center justify-between px-4 py-3">
              <div>
                <p class="font-medium">
                  {{ m.user?.name ?? '—' }}
                </p>
                <p class="text-xs text-muted">
                  {{ m.user?.email }}
                </p>
              </div>
              <UBadge color="neutral" variant="subtle" class="capitalize">
                {{ m.role }}
              </UBadge>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
