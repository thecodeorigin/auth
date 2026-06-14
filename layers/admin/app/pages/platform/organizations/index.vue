<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

interface OrgRow { id: string, name: string, slug: string, metadata?: string | null, createdAt?: string | Date }

const orgApi = useOrgApi()
const UBadge = resolveComponent('UBadge')
const ULink = resolveComponent('ULink')

const orgs = ref<OrgRow[]>([])
const loading = ref(true)

function isPersonal(o: OrgRow) {
  try {
    return JSON.parse(o.metadata ?? '{}')?.personal === true
  }
  catch {
    return false
  }
}

async function load() {
  loading.value = true
  try {
    const { data } = await orgApi.list()
    orgs.value = (data ?? []) as OrgRow[]
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const columns: TableColumn<OrgRow>[] = [
  { id: 'name', header: 'Name', cell: ({ row }) => h(ULink, { to: `/platform/organizations/${row.original.id}`, class: 'font-medium text-primary' }, () => row.original.name) },
  { id: 'slug', header: 'Slug', cell: ({ row }) => h('code', { class: 'text-xs text-muted' }, row.original.slug) },
  { id: 'type', header: 'Type', cell: ({ row }) => h(UBadge, { color: 'neutral', variant: 'subtle' }, () => (isPersonal(row.original) ? 'Personal' : 'Team')) },
]
</script>

<template>
  <UDashboardPanel id="platform-orgs">
    <template #header>
      <DashboardNavbar title="Organizations" />
    </template>
    <template #body>
      <UAlert
        color="info"
        variant="subtle"
        icon="i-lucide-info"
        title="Scope note"
        description="Cross-tenant organization listing requires a dedicated admin endpoint that isn't available yet. This view shows organizations you belong to."
        class="mb-4"
      />
      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="orgs" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              No organizations.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
