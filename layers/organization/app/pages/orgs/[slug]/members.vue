<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface MemberRow {
  id: string
  userId: string
  role: string
  createdAt: string | Date
  user?: { name?: string | null, email?: string | null, image?: string | null }
}

const orgApi = useOrgApi()
const toast = useToast()
const { user: me } = useUserSession()
const { $ability } = useNuxtApp()

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')
const UAvatar = resolveComponent('UAvatar')

const members = ref<MemberRow[]>([])
const roleNames = ref<string[]>(['owner', 'admin', 'member'])
const loading = ref(true)
const error = ref('')

const canUpdate = computed(() => $ability.can('update', 'member'))
const canRemove = computed(() => $ability.can('delete', 'member'))
const canInvite = computed(() => $ability.can('create', 'member'))
const ownerCount = computed(() => members.value.filter(m => m.role === 'owner').length)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const { data, error: e } = await orgApi.listMembers()
    if (e)
      throw new Error(e.message ?? 'Failed to load members')
    members.value = ((data as { members?: MemberRow[] })?.members ?? [])
    const { data: roles } = await orgApi.listRoles()
    const dyn = ((roles as { roles?: { role: string }[] })?.roles ?? []).map(r => r.role)
    roleNames.value = Array.from(new Set(['owner', 'admin', 'member', ...dyn]))
  }
  catch (err) {
    error.value = (err as Error).message
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function changeRole(member: MemberRow, role: string) {
  try {
    const { error: e } = await orgApi.updateMemberRole({ memberId: member.id, role })
    if (e)
      throw new Error(e.message ?? 'Failed to update role')
    toast.add({ title: 'Role updated', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: (err as Error).message, color: 'error' })
  }
}

async function remove(member: MemberRow) {
  try {
    const { error: e } = await orgApi.removeMember({ memberIdOrEmail: member.id })
    if (e)
      throw new Error(e.message ?? 'Failed to remove member')
    toast.add({ title: 'Member removed', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Remove failed', description: (err as Error).message, color: 'error' })
  }
}

function rowMenu(member: MemberRow): DropdownMenuItem[][] {
  const isLastOwner = member.role === 'owner' && ownerCount.value <= 1
  const isSelf = member.userId === me.value?.id
  const groups: DropdownMenuItem[][] = []

  if (canUpdate.value && !isLastOwner) {
    groups.push(roleNames.value
      .filter(r => r !== member.role)
      .map(r => ({ label: `Make ${r}`, icon: 'i-lucide-tag', onSelect: () => changeRole(member, r) })))
  }
  if (canRemove.value && !isSelf && !isLastOwner)
    groups.push([{ label: 'Remove', icon: 'i-lucide-user-minus', color: 'error' as const, onSelect: () => remove(member) }])

  return groups.filter(g => g.length)
}

const columns: TableColumn<MemberRow>[] = [
  {
    id: 'member',
    header: 'Member',
    cell: ({ row }) => h('div', { class: 'flex items-center gap-3' }, [
      h(UAvatar, { src: row.original.user?.image ?? undefined, alt: row.original.user?.name ?? '', size: 'sm', text: (row.original.user?.name || row.original.user?.email || '?').charAt(0).toUpperCase() }),
      h('div', [
        h('p', { class: 'font-medium' }, row.original.user?.name ?? '—'),
        h('p', { class: 'text-xs text-muted' }, row.original.user?.email ?? ''),
      ]),
    ]),
  },
  {
    id: 'role',
    header: 'Role',
    cell: ({ row }) => h(UBadge, { color: row.original.role === 'owner' ? 'primary' : 'neutral', variant: 'subtle', class: 'capitalize' }, () => row.original.role),
  },
  {
    id: 'joined',
    header: 'Joined',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => {
      const menu = rowMenu(row.original)
      if (!menu.length)
        return null
      return h('div', { class: 'flex justify-end' }, [
        h(UDropdownMenu, { items: menu }, () => h(UButton, { 'icon': 'i-lucide-ellipsis-vertical', 'variant': 'ghost', 'size': 'xs', 'aria-label': 'Member actions' })),
      ])
    },
  },
]

// Invite modal
const inviteOpen = ref(false)
const inviteEmail = ref('')
const inviteRole = ref('member')
const inviting = ref(false)

async function submitInvite() {
  if (!inviteEmail.value.trim())
    return
  inviting.value = true
  try {
    const { error: e } = await orgApi.invite({ email: inviteEmail.value.trim(), role: inviteRole.value })
    if (e)
      throw new Error(e.message ?? 'Failed to invite')
    toast.add({ title: 'Invitation sent', color: 'success' })
    inviteOpen.value = false
    inviteEmail.value = ''
  }
  catch (err) {
    toast.add({ title: 'Invite failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    inviting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="org-members">
    <template #header>
      <DashboardNavbar title="Members">
        <template #right>
          <UButton v-if="canInvite" icon="i-lucide-user-plus" label="Invite member" @click="inviteOpen = true" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" class="mb-3" />

      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="members" :loading="loading">
          <template #empty>
            <div class="text-center text-muted py-8">
              No members yet.
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="inviteOpen" title="Invite member">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Email" required>
          <UInput v-model="inviteEmail" type="email" placeholder="teammate@example.com" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Role" required>
          <USelect v-model="inviteRole" :items="roleNames.map(r => ({ label: r, value: r }))" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="inviteOpen = false" />
          <UButton label="Send invite" :loading="inviting" :disabled="!inviteEmail.trim()" @click="submitInvite" />
        </div>
      </div>
    </template>
  </UModal>
</template>
