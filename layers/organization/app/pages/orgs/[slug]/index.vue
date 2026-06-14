<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface Member { id: string, userId: string, role: string }
interface FullOrg { id: string, name: string, slug: string, members?: Member[] }

const route = useRoute()
const orgApi = useOrgApi()
const { user, session, fetchSession } = useUserSession()
const slug = computed(() => String(route.params.slug))

const { data: org, pending, error } = await useAsyncData(
  () => `org-${slug.value}`,
  async () => {
    const { data, error: e } = await orgApi.getFull({ organizationSlug: slug.value })
    if (e)
      throw new Error(e.message ?? 'Organization not found')
    return data as FullOrg
  },
  { server: false },
)

// Make this org the active context (drives nav + $ability) when reached directly.
watch(org, async (o) => {
  if (o && session.value?.activeOrganizationId !== o.id) {
    await orgApi.setActive(o.id)
    await fetchSession({ force: true })
  }
}, { immediate: true })

const members = computed(() => org.value?.members ?? [])
const myRole = computed(() => members.value.find(m => m.userId === user.value?.id)?.role ?? '—')
</script>

<template>
  <UDashboardPanel id="org-overview">
    <template #header>
      <DashboardNavbar :title="org?.name ?? 'Organization'" />
    </template>

    <template #body>
      <div v-if="pending" class="space-y-3">
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-24 w-full" />
      </div>

      <UAlert
        v-else-if="error"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        title="Can't open this organization"
        :description="error.message"
      />

      <div v-else class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-3">
          <UCard>
            <p class="text-sm text-muted">
              Members
            </p>
            <p class="text-2xl font-semibold text-highlighted">
              {{ members.length }}
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Your role
            </p>
            <p class="text-2xl font-semibold text-highlighted capitalize">
              {{ myRole }}
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Slug
            </p>
            <p class="text-lg font-mono text-highlighted">
              {{ org?.slug }}
            </p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Quick links
            </h2>
          </template>
          <div class="flex flex-wrap gap-2">
            <UButton icon="i-lucide-users" variant="subtle" label="Members" :to="`/orgs/${slug}/members`" />
            <UButton icon="i-lucide-settings" variant="subtle" label="Settings" :to="`/orgs/${slug}/settings`" />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
