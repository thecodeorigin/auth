<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface ApiKeyRow {
  id: string
  name: string | null
  start: string | null
  enabled: boolean
  createdAt: string | Date
  expiresAt: string | Date | null
}

const api = useApiKeysApi()
const UBadge = resolveComponent('UBadge')
const ULink = resolveComponent('ULink')

const keys = ref<ApiKeyRow[]>([])
const loading = ref(true)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data, error: e } = await api.list()
    if (e)
      throw new Error(e.message ?? 'Failed to load API keys')
    keys.value = ((data as { apiKeys?: ApiKeyRow[] })?.apiKeys ?? []) as ApiKeyRow[]
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

function statusOf(k: ApiKeyRow): { label: string, color: 'error' | 'warning' | 'success' } {
  if (!k.enabled)
    return { label: 'Disabled', color: 'error' }
  if (k.expiresAt && new Date(k.expiresAt).getTime() < Date.now())
    return { label: 'Expired', color: 'warning' }
  return { label: 'Active', color: 'success' }
}

function fmt(d: string | Date | null): string {
  if (!d)
    return 'No expiry'
  return new Date(d).toLocaleDateString()
}

const columns: TableColumn<ApiKeyRow>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => h(ULink, { to: `/account/api-keys/${row.original.id}`, class: 'font-medium text-primary' }, () => row.original.name ?? '(unnamed)'),
  },
  {
    id: 'prefix',
    header: 'Prefix',
    cell: ({ row }) => h('code', { class: 'text-xs text-muted' }, row.original.start ?? '—'),
  },
  {
    id: 'created',
    header: 'Created',
    cell: ({ row }) => fmt(row.original.createdAt),
  },
  {
    id: 'expires',
    header: 'Expires',
    cell: ({ row }) => fmt(row.original.expiresAt),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const s = statusOf(row.original)
      return h(UBadge, { color: s.color, variant: 'subtle' }, () => s.label)
    },
  },
]
</script>

<template>
  <UDashboardPanel id="account-api-keys">
    <template #header>
      <DashboardNavbar title="API Keys">
        <template #right>
          <UButton icon="i-lucide-plus" label="Create API Key" to="/account/api-keys/new" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" class="mb-3" />

      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="keys" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8 space-y-3">
              <p>You don't have any API keys yet.</p>
              <UButton icon="i-lucide-plus" label="Create your first key" to="/account/api-keys/new" />
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
