<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import OrganizationRoleModal from '#layers/organization/app/components/Organization/OrganizationRoleModal.vue'
import { roles as builtinRoles } from '#shared/permissions'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface RoleRow {
  name: string
  builtin: boolean
  permission: Record<string, string[]>
}

const orgApi = useOrgApi()
const toast = useToast()
const { $ability } = useNuxtApp()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const canCreate = computed(() => $ability.can('create', 'role'))
const canUpdate = computed(() => $ability.can('update', 'role'))
const canDelete = computed(() => $ability.can('delete', 'role'))

const customRoles = ref<RoleRow[]>([])
const loading = ref(true)

function permCount(p: Record<string, string[]>) {
  return Object.values(p).reduce((n, v) => n + v.length, 0)
}

const builtinRows = computed<RoleRow[]>(() =>
  Object.entries(builtinRoles).map(([name, def]) => ({
    name,
    builtin: true,
    permission: (def.statements as unknown as Record<string, string[]>),
  })))

const rows = computed<RoleRow[]>(() => [...builtinRows.value, ...customRoles.value])

async function load() {
  loading.value = true
  try {
    const { data } = await orgApi.listRoles()
    const list = (Array.isArray(data) ? data : ((data as unknown as { roles?: unknown[] } | null)?.roles ?? [])) as { role: string, permission?: Record<string, string[]> | string }[]
    customRoles.value = list.map((r) => {
      let permission: Record<string, string[]> = {}
      try {
        permission = typeof r.permission === 'string' ? JSON.parse(r.permission) : (r.permission ?? {})
      }
      catch {
        permission = {}
      }
      return { name: r.role, builtin: false, permission }
    })
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

const modalOpen = ref(false)
const editing = ref<RoleRow | null>(null)

function openCreate() {
  editing.value = null
  modalOpen.value = true
}
function openEdit(role: RoleRow) {
  editing.value = role
  modalOpen.value = true
}

async function remove(role: RoleRow) {
  try {
    const { error } = await orgApi.deleteRole({ roleName: role.name })
    if (error)
      throw new Error(error.message ?? 'Failed to delete role')
    toast.add({ title: 'Role deleted', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: (err as Error).message, color: 'error' })
  }
}

const columns: TableColumn<RoleRow>[] = [
  { id: 'name', header: 'Name', cell: ({ row }) => h('span', { class: 'font-medium capitalize' }, row.original.name) },
  {
    id: 'type',
    header: 'Type',
    cell: ({ row }) => h(UBadge, { color: row.original.builtin ? 'neutral' : 'primary', variant: 'subtle' }, () => (row.original.builtin ? 'Built-in' : 'Custom')),
  },
  { id: 'perms', header: 'Permissions', cell: ({ row }) => `${permCount(row.original.permission)} grant(s)` },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => {
      if (row.original.builtin)
        return null
      return h('div', { class: 'flex gap-1 justify-end' }, [
        canUpdate.value ? h(UButton, { 'icon': 'i-lucide-pencil', 'variant': 'ghost', 'size': 'xs', 'aria-label': 'Edit role', 'onClick': () => openEdit(row.original) }) : null,
        canDelete.value ? h(UButton, { 'icon': 'i-lucide-trash-2', 'color': 'error', 'variant': 'ghost', 'size': 'xs', 'aria-label': 'Delete role', 'onClick': () => remove(row.original) }) : null,
      ])
    },
  },
]
</script>

<template>
  <UDashboardPanel id="org-roles">
    <template #header>
      <DashboardNavbar title="Roles">
        <template #right>
          <UButton v-if="canCreate" icon="i-lucide-plus" label="Create role" @click="openCreate" />
        </template>
      </DashboardNavbar>
    </template>
    <template #body>
      <UCard :ui="{ body: 'sm:p-0' }">
        <UTable :columns="columns" :data="rows" :loading="loading" />
      </UCard>
    </template>
  </UDashboardPanel>

  <OrganizationRoleModal v-model:open="modalOpen" :role="editing" @saved="load" />
</template>
