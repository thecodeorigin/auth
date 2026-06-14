<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ClientListItem } from '~/composables/useApplicationsApi'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

// Read is open to any authenticated user (catalog is non-secret); the Create
// action is admin-only.
const api = useApplicationsApi()
const toast = useToast()
const { user } = useUserSession()
const isAdmin = computed(() => user.value?.role === 'admin')

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const q = ref('')
const all = ref<ClientListItem[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    all.value = await api.list()
  }
  catch (err) {
    error.value = (err as Error).message ?? 'Failed to load applications'
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term)
    return all.value
  return all.value.filter(c => (c.name ?? '').toLowerCase().includes(term) || c.clientId.toLowerCase().includes(term))
})

async function removeApp(row: ClientListItem) {
  if (!confirm(`Delete application "${row.name ?? row.clientId}"? This cannot be undone.`))
    return
  try {
    await api.remove(row.clientId)
    toast.add({ title: 'Application deleted', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: (err as Error).message, color: 'error' })
  }
}

const columns = computed<TableColumn<ClientListItem>[]>(() => {
  const cols: TableColumn<ClientListItem>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: ({ row }) => (isAdmin.value
        ? h(resolveComponent('ULink'), { to: `/platform/applications/${row.original.clientId}`, class: 'font-medium text-primary' }, () => row.original.name ?? row.original.clientId)
        : h('span', { class: 'font-medium' }, row.original.name ?? row.original.clientId)),
    },
    {
      id: 'clientId',
      header: 'Client ID',
      cell: ({ row }) => h('code', { class: 'text-xs text-muted' }, row.original.clientId),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => h(UBadge, { color: row.original.disabled ? 'error' : 'success', variant: 'subtle' }, () => (row.original.disabled ? 'Disabled' : 'Active')),
    },
  ]
  if (isAdmin.value) {
    cols.push({
      id: 'actions',
      header: '',
      meta: { class: { td: 'text-right' } },
      cell: ({ row }) => h('div', { class: 'flex gap-1 justify-end' }, [
        h(UButton, { 'icon': 'i-lucide-pencil', 'variant': 'ghost', 'size': 'xs', 'aria-label': 'Edit', 'to': `/platform/applications/${row.original.clientId}` }),
        h(UButton, { 'icon': 'i-lucide-trash-2', 'color': 'error', 'variant': 'ghost', 'size': 'xs', 'aria-label': 'Delete', 'onClick': () => removeApp(row.original) }),
      ]),
    })
  }
  return cols
})
</script>

<template>
  <UDashboardPanel id="platform-applications">
    <template #header>
      <DashboardNavbar title="Applications">
        <template #right>
          <UButton v-if="isAdmin" icon="i-lucide-plus" label="Create Application" to="/platform/applications/new" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div class="flex items-center gap-3 mb-3">
        <UInput v-model="q" icon="i-lucide-search" placeholder="Search applications…" class="w-64" />
      </div>

      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" class="mb-3" />

      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="rows" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              No applications registered.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
