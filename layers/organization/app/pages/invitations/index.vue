<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface MyInvitation {
  id: string
  organizationId: string
  organizationName?: string | null
  role: string
  status: string
  expiresAt: string | Date
}

const orgApi = useOrgApi()
const toast = useToast()
const { fetchSession } = useUserSession()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const invitations = ref<MyInvitation[]>([])
const loading = ref(true)
const busy = ref('')

function isExpired(inv: MyInvitation) {
  return inv.status === 'expired' || new Date(inv.expiresAt).getTime() < Date.now()
}

async function load() {
  loading.value = true
  try {
    const { data } = await orgApi.listMyInvitations()
    invitations.value = ((data ?? []) as MyInvitation[]).filter(i => i.status === 'pending')
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function accept(inv: MyInvitation) {
  busy.value = inv.id
  try {
    const { error } = await orgApi.acceptInvitation(inv.id)
    if (error)
      throw new Error(error.message ?? 'Failed to accept')
    await orgApi.setActive(inv.organizationId)
    await fetchSession({ force: true })
    toast.add({ title: 'Invitation accepted', color: 'success' })
    await navigateTo('/')
  }
  catch (err) {
    toast.add({ title: 'Accept failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

async function decline(inv: MyInvitation) {
  busy.value = inv.id
  try {
    const { error } = await orgApi.rejectInvitation(inv.id)
    if (error)
      throw new Error(error.message ?? 'Failed to decline')
    toast.add({ title: 'Invitation declined', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Decline failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

const columns: TableColumn<MyInvitation>[] = [
  { id: 'org', header: 'Organization', cell: ({ row }) => h('span', { class: 'font-medium' }, row.original.organizationName ?? row.original.organizationId) },
  { id: 'role', header: 'Role', cell: ({ row }) => h(UBadge, { color: 'neutral', variant: 'subtle', class: 'capitalize' }, () => row.original.role) },
  { id: 'expires', header: 'Expires', cell: ({ row }) => new Date(row.original.expiresAt).toLocaleDateString() },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => h('div', { class: 'flex gap-2 justify-end' }, [
      h(UButton, { variant: 'ghost', size: 'xs', label: 'Decline', loading: busy.value === row.original.id, disabled: isExpired(row.original), onClick: () => decline(row.original) }),
      h(UButton, { size: 'xs', label: 'Accept', loading: busy.value === row.original.id, disabled: isExpired(row.original), onClick: () => accept(row.original) }),
    ]),
  },
]
</script>

<template>
  <UDashboardPanel id="my-invitations">
    <template #header>
      <DashboardNavbar title="My Invitations" />
    </template>
    <template #body>
      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="invitations" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              You have no pending invitations.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
