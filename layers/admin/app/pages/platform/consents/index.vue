<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { AdminConsent } from '~/composables/useApplicationsApi'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

const appsApi = useApplicationsApi()
const toast = useToast()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const consents = ref<AdminConsent[]>([])
const loading = ref(true)
const q = ref('')

async function load() {
  loading.value = true
  try {
    consents.value = await appsApi.adminConsents()
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const rows = computed(() => {
  const term = q.value.trim().toLowerCase()
  if (!term)
    return consents.value
  return consents.value.filter(c =>
    (c.clientName ?? c.clientId).toLowerCase().includes(term)
    || (c.userEmail ?? '').toLowerCase().includes(term))
})

async function revoke(row: AdminConsent) {
  if (!confirm('Revoke this consent? The user will re-consent on next sign-in; existing tokens remain valid until expiry.'))
    return
  try {
    await appsApi.adminRevokeConsent(row.id)
    toast.add({ title: 'Consent revoked', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Revoke failed', description: (err as Error).message, color: 'error' })
  }
}

const columns: TableColumn<AdminConsent>[] = [
  { id: 'user', header: 'User', cell: ({ row }) => h('span', { class: 'font-medium' }, row.original.userEmail ?? row.original.userId ?? '—') },
  { id: 'app', header: 'Application', cell: ({ row }) => row.original.clientName ?? row.original.clientId },
  { id: 'scopes', header: 'Scopes', cell: ({ row }) => h('div', { class: 'flex flex-wrap gap-1' }, row.original.scopes.map(s => h(UBadge, { color: 'neutral', variant: 'subtle', size: 'sm' }, () => s))) },
  { id: 'date', header: 'Consented', cell: ({ row }) => (row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : '—') },
  { id: 'actions', header: '', meta: { class: { td: 'text-right' } }, cell: ({ row }) => h(UButton, { color: 'error', variant: 'ghost', size: 'xs', label: 'Revoke', onClick: () => revoke(row.original) }) },
]
</script>

<template>
  <UDashboardPanel id="platform-consents">
    <template #header>
      <DashboardNavbar title="Consents" />
    </template>
    <template #body>
      <div class="flex items-center gap-3 mb-3">
        <UInput v-model="q" icon="i-lucide-search" placeholder="Filter by user or application…" class="w-72" />
      </div>
      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="rows" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              No consents granted yet.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
