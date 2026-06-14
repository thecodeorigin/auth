<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface MemberRow { id: string, userId: string, role: string, user?: { name?: string | null, email?: string | null } }
interface GrantRow { clientId: string, role: string | null }

const route = useRoute()
const orgApi = useOrgApi()
const appsApi = useApplicationsApi()
const toast = useToast()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const slug = computed(() => String(route.params.slug))

// Resolve orgId from the route slug (SEC-13: orgId is taken from the route, the
// custom access routes are independently org-admin gated server-side).
const { data: org, error: orgError } = await useAsyncData(
  () => `app-access-org-${slug.value}`,
  async () => {
    const { data, error } = await orgApi.getFull({ organizationSlug: slug.value })
    if (error)
      throw new Error(error.message ?? 'Organization not found')
    return data as { id: string }
  },
)
const orgId = computed(() => org.value?.id ?? '')

const members = ref<MemberRow[]>([])
const catalog = ref<{ clientId: string, name: string | null }[]>([])
const selectedUserId = ref<string>('')
const grants = ref<GrantRow[]>([])
const loadingGrants = ref(false)

const nameByClient = computed(() => Object.fromEntries(catalog.value.map(c => [c.clientId, c.name ?? c.clientId])))

const memberItems = computed(() => members.value.map(m => ({
  label: m.user?.name || m.user?.email || m.userId,
  value: m.userId,
})))

const appItems = computed(() => [
  { label: 'All Applications', value: '*' },
  ...catalog.value.map(c => ({ label: c.name ?? c.clientId, value: c.clientId })),
])

const roleItems = [
  { label: 'Inherit member role', value: '' },
  { label: 'owner', value: 'owner' },
  { label: 'admin', value: 'admin' },
  { label: 'member', value: 'member' },
]

const grantApp = ref('*')
const grantRole = ref('')
const granting = ref(false)

onMounted(async () => {
  const [{ data: m }, list] = await Promise.all([
    orgApi.listMembers(),
    appsApi.list().catch(() => []),
  ])
  members.value = ((m as { members?: MemberRow[] })?.members ?? [])
  catalog.value = list
})

async function loadGrants() {
  if (!selectedUserId.value || !orgId.value)
    return
  loadingGrants.value = true
  try {
    grants.value = await appsApi.accessList(orgId.value, selectedUserId.value) as GrantRow[]
  }
  catch (err) {
    toast.add({ title: 'Failed to load grants', description: (err as Error).message, color: 'error' })
  }
  finally {
    loadingGrants.value = false
  }
}
watch(selectedUserId, loadGrants)

async function grant() {
  if (!selectedUserId.value)
    return
  granting.value = true
  try {
    await appsApi.accessSet(orgId.value, selectedUserId.value, { clientId: grantApp.value, role: grantRole.value || null })
    toast.add({ title: 'Access granted', color: 'success' })
    grantApp.value = '*'
    grantRole.value = ''
    await loadGrants()
  }
  catch (err) {
    toast.add({ title: 'Grant failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    granting.value = false
  }
}

async function revoke(g: GrantRow) {
  if (g.clientId === '*' && !confirm('Revoking "All Applications" removes this member\'s blanket access. Continue?'))
    return
  try {
    await appsApi.accessRevoke(orgId.value, selectedUserId.value, g.clientId)
    toast.add({ title: 'Access revoked', color: 'success' })
    await loadGrants()
  }
  catch (err) {
    toast.add({ title: 'Revoke failed', description: (err as Error).message, color: 'error' })
  }
}

const columns: TableColumn<GrantRow>[] = [
  {
    id: 'app',
    header: 'Application',
    cell: ({ row }) => (row.original.clientId === '*'
      ? h(UBadge, { color: 'primary', variant: 'subtle' }, () => 'All Applications')
      : h('span', { class: 'font-medium' }, nameByClient.value[row.original.clientId] ?? row.original.clientId)),
  },
  {
    id: 'role',
    header: 'Role',
    cell: ({ row }) => (row.original.role
      ? h(UBadge, { color: 'neutral', variant: 'subtle', class: 'capitalize' }, () => row.original.role)
      : h('span', { class: 'text-muted text-sm' }, 'Inherited')),
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
  <UDashboardPanel id="org-app-access">
    <template #header>
      <DashboardNavbar title="App Access" />
    </template>

    <template #body>
      <UAlert v-if="orgError" color="error" variant="soft" :title="orgError.message" icon="i-lucide-circle-alert" />

      <div v-else class="space-y-6 max-w-3xl">
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="How app access works"
          description="A specific app grant overrides the blanket “All Applications” (*) grant. Roles set here apply within the chosen application's scope; leave blank to inherit the member's org role."
        />

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Member
            </h2>
          </template>
          <USelect
            v-model="selectedUserId"
            :items="memberItems"
            placeholder="Select a member…"
            class="w-full sm:w-80"
          />
        </UCard>

        <template v-if="selectedUserId">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Grant access
              </h2>
            </template>
            <div class="flex flex-col sm:flex-row gap-3 sm:items-end">
              <UFormField label="Application" class="flex-1">
                <USelect v-model="grantApp" :items="appItems" class="w-full" />
              </UFormField>
              <UFormField label="Role" class="flex-1">
                <USelect v-model="grantRole" :items="roleItems" class="w-full" />
              </UFormField>
              <UButton label="Grant" :loading="granting" @click="grant" />
            </div>
          </UCard>

          <UCard :ui="{ body: 'sm:p-0' }">
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Current grants
              </h2>
            </template>
            <UTable :columns="columns" :data="grants" :loading="loadingGrants">
              <template #empty>
                <div class="text-center text-muted py-8">
                  No grants for this member.
                </div>
              </template>
            </UTable>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
