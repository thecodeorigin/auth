<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface InvitationRow {
  id: string
  email: string
  role: string
  status: string
  expiresAt: string | Date
}

const orgApi = useOrgApi()
const toast = useToast()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const invitations = ref<InvitationRow[]>([])
const loading = ref(true)
const error = ref('')

function isExpired(inv: InvitationRow) {
  return inv.status === 'expired' || new Date(inv.expiresAt).getTime() < Date.now()
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data, error: e } = await orgApi.listInvitations()
    if (e)
      throw new Error(e.message ?? 'Failed to load invitations')
    invitations.value = ((data ?? []) as InvitationRow[]).filter(i => i.status !== 'canceled')
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function cancel(inv: InvitationRow) {
  try {
    const { error: e } = await orgApi.cancelInvitation(inv.id)
    if (e)
      throw new Error(e.message ?? 'Failed to cancel')
    toast.add({ title: 'Invitation canceled', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Cancel failed', description: (err as Error).message, color: 'error' })
  }
}

const columns: TableColumn<InvitationRow>[] = [
  { id: 'email', header: 'Email', cell: ({ row }) => row.original.email },
  { id: 'role', header: 'Role', cell: ({ row }) => h(UBadge, { color: 'neutral', variant: 'subtle', class: 'capitalize' }, () => row.original.role) },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, { color: isExpired(row.original) ? 'warning' : 'info', variant: 'subtle' }, () => (isExpired(row.original) ? 'Expired' : 'Pending')),
  },
  { id: 'expires', header: 'Expires', cell: ({ row }) => new Date(row.original.expiresAt).toLocaleDateString() },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h(UButton, { color: 'error', variant: 'ghost', size: 'xs', label: 'Cancel', disabled: isExpired(row.original), onClick: () => cancel(row.original) }),
  },
]
</script>

<template>
  <UDashboardPanel id="org-invitations">
    <template #header>
      <DashboardNavbar title="Invitations" />
    </template>
    <template #body>
      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" class="mb-3" />
      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="invitations" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              No pending invitations.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
