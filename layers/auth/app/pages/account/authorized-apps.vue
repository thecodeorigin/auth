<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface ConsentRow {
  id: string
  clientId: string
  scopes?: string[] | string | null
  createdAt: string | Date
}

const appsApi = useApplicationsApi()
const toast = useToast()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const consents = ref<ConsentRow[]>([])
const nameByClient = ref<Record<string, string>>({})
const loading = ref(true)
const error = ref('')

function scopesOf(c: ConsentRow): string[] {
  if (Array.isArray(c.scopes))
    return c.scopes
  if (typeof c.scopes === 'string') {
    try {
      const parsed = JSON.parse(c.scopes)
      if (Array.isArray(parsed))
        return parsed
    }
    catch {
      return c.scopes.split(/[\s,]+/).filter(Boolean)
    }
  }
  return []
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [raw, catalog] = await Promise.all([
      appsApi.consents() as Promise<unknown>,
      appsApi.list().catch(() => []),
    ])
    consents.value = (Array.isArray(raw) ? raw : ((raw as { consents?: ConsentRow[] })?.consents ?? [])) as ConsentRow[]
    nameByClient.value = Object.fromEntries(catalog.map(c => [c.clientId, c.name ?? c.clientId]))
  }
  catch (err) {
    error.value = (err as Error).message ?? 'Failed to load authorized apps'
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function revoke(row: ConsentRow) {
  try {
    await appsApi.deleteConsent({ id: row.id })
    toast.add({ title: 'Access revoked', description: 'This app will ask for consent next time you sign in.', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Revoke failed', description: (err as Error).message, color: 'error' })
  }
}

const columns: TableColumn<ConsentRow>[] = [
  {
    id: 'app',
    header: 'Application',
    cell: ({ row }) => h('span', { class: 'font-medium' }, nameByClient.value[row.original.clientId] ?? row.original.clientId),
  },
  {
    id: 'scopes',
    header: 'Scopes',
    cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, scopesOf(row.original).map(s => h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => s))),
  },
  {
    id: 'created',
    header: 'Authorized',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, { color: 'error', variant: 'ghost', size: 'xs', label: 'Revoke', onClick: () => revoke(row.original) }),
  },
]
</script>

<template>
  <UDashboardPanel id="account-authorized-apps">
    <template #header>
      <DashboardNavbar title="Applications" />
    </template>

    <template #body>
      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" class="mb-3" />
      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="consents" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              You haven't authorized any applications.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
