<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import PlatformUserCreateModal from '#layers/admin/app/components/Platform/PlatformUserCreateModal.vue'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

interface AdminUser {
  id: string
  name: string | null
  email: string
  role?: string | null
  banned?: boolean | null
  createdAt?: string | Date
}

const api = useUsersApi()
const { user: me } = useUserSession()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const { items: users, q, loading, loadMore, hasMore, reset } = useInfiniteList<AdminUser>(
  ({ q, offset, limit }) => api.list({ searchValue: q || undefined, offset, limit }).then((r) => {
    const list = (r.data?.users ?? []) as AdminUser[]
    const total = r.data?.total ?? offset + list.length
    return { items: list, total, hasMore: offset + list.length < total }
  }),
  { immediate: true },
)

const scrollEl = ref<HTMLElement>()
useInfiniteScroll(scrollEl, loadMore, { distance: 120, canLoadMore: () => hasMore.value })

const columns: TableColumn<AdminUser>[] = [
  {
    id: 'name',
    header: 'Name',
    cell: ({ row }) => h('div', [
      h('p', { class: 'font-medium' }, row.original.name ?? '—'),
      h('p', { class: 'text-xs text-muted' }, row.original.email),
    ]),
  },
  {
    id: 'role',
    header: 'Role',
    cell: ({ row }) => h(UBadge, { color: row.original.role === 'admin' ? 'primary' : 'neutral', variant: 'subtle' }, () => row.original.role ?? 'user'),
  },
  {
    id: 'status',
    header: 'Status',
    cell: ({ row }) => h(UBadge, { color: row.original.banned ? 'error' : 'success', variant: 'subtle' }, () => (row.original.banned ? 'Banned' : 'Active')),
  },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => (row.original.id === me.value?.id
      ? null
      : h('div', { class: 'flex gap-1 justify-end' }, [
          h(UButton, { 'icon': 'i-lucide-eye', 'variant': 'ghost', 'size': 'xs', 'aria-label': 'View user', 'to': `/platform/users/${row.original.id}` }),
        ])),
  },
]

const createOpen = ref(false)

function onCreated() {
  reset()
  loadMore()
}
</script>

<template>
  <UDashboardPanel id="platform-users">
    <template #header>
      <DashboardNavbar title="Users">
        <template #right>
          <UButton icon="i-lucide-plus" label="New user" @click="createOpen = true" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div class="flex items-center gap-3 mb-3">
        <UInput v-model="q" icon="i-lucide-search" placeholder="Search users…" class="w-64" />
      </div>
      <UCard :ui="{ body: 'sm:p-0' }">
        <div ref="scrollEl" class="max-h-[70vh] overflow-y-auto">
          <UTable :columns="columns" :data="users">
            <template #empty>
              <div class="text-center text-muted py-8">
                No users found.
              </div>
            </template>
          </UTable>
          <div v-if="loading" class="py-3 text-center text-muted text-sm">
            Loading…
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>

  <PlatformUserCreateModal v-model:open="createOpen" @created="onCreated" />
</template>
