<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

interface ApiKeyRow {
  id: string
  name: string | null
  start: string | null
  enabled: boolean
  userId?: string
  createdAt: string | Date
  expiresAt: string | Date | null
}

const api = useApiKeysApi()
const { user } = useUserSession()
const toast = useToast()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const keys = ref<ApiKeyRow[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    const { data } = await api.list()
    keys.value = ((data as { apiKeys?: ApiKeyRow[] })?.apiKeys ?? []) as ApiKeyRow[]
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

async function toggle(k: ApiKeyRow) {
  try {
    await api.update({ keyId: k.id, enabled: !k.enabled })
    toast.add({ title: k.enabled ? 'Key disabled' : 'Key enabled', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: (err as Error).message, color: 'error' })
  }
}

async function remove(k: ApiKeyRow) {
  if (!confirm(`Delete key "${k.name ?? k.start}"? This cannot be undone.`))
    return
  try {
    await api.remove(k.id)
    toast.add({ title: 'Key deleted', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: (err as Error).message, color: 'error' })
  }
}

const columns: TableColumn<ApiKeyRow>[] = [
  { id: 'name', header: 'Name', cell: ({ row }) => h('span', { class: 'font-medium' }, row.original.name ?? '(unnamed)') },
  { id: 'owner', header: 'Owner', cell: ({ row }) => (row.original.userId === user.value?.id ? 'You' : (row.original.userId ?? '—')) },
  { id: 'prefix', header: 'Prefix', cell: ({ row }) => h('code', { class: 'text-xs text-muted' }, row.original.start ?? '—') },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const s = statusOf(row.original)
      return h(UBadge, { color: s.color, variant: 'subtle' }, () => s.label)
    },
  },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h('div', { class: 'flex gap-1 justify-end' }, [
      h(UButton, { variant: 'ghost', size: 'xs', label: row.original.enabled ? 'Disable' : 'Enable', onClick: () => toggle(row.original) }),
      h(UButton, { 'icon': 'i-lucide-trash-2', 'color': 'error', 'variant': 'ghost', 'size': 'xs', 'aria-label': 'Delete', 'onClick': () => remove(row.original) }),
    ]),
  },
]
</script>

<template>
  <UDashboardPanel id="platform-api-keys">
    <template #header>
      <DashboardNavbar title="API Keys" />
    </template>
    <template #body>
      <UAlert color="info" variant="subtle" icon="i-lucide-info" title="Scope note" description="Cross-user API key administration requires a dedicated admin endpoint that isn't available yet. This view shows keys you own." class="mb-4" />
      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="keys" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              No API keys.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
