<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import PlatformUserBanModal from '#layers/admin/app/components/Platform/PlatformUserBanModal.vue'
import PlatformUserDeleteModal from '#layers/admin/app/components/Platform/PlatformUserDeleteModal.vue'
import PlatformUserSetPasswordModal from '#layers/admin/app/components/Platform/PlatformUserSetPasswordModal.vue'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

interface DetailUser {
  id: string
  name: string | null
  email: string
  role?: string | null
  emailVerified?: boolean
  banned?: boolean | null
  banReason?: string | null
}
interface SessionRow { id: string, token: string, createdAt: string | Date, ipAddress?: string | null, userAgent?: string | null }

const route = useRoute()
const api = useUsersApi()
const toast = useToast()
const { user: me, session, fetchSession } = useUserSession()
const UButton = resolveComponent('UButton')
const id = computed(() => String(route.params.id))

const isImpersonating = computed(() => !!session.value?.impersonatedBy)
const isSelf = computed(() => id.value === me.value?.id)

const user = ref<DetailUser | null>(null)
const sessions = ref<SessionRow[]>([])
const loading = ref(true)
const nameDraft = ref('')
const savingName = ref(false)

async function load() {
  loading.value = true
  try {
    const { data, error } = await api.get(id.value)
    if (error || !data) {
      toast.add({ title: 'User not found', color: 'error' })
      await navigateTo('/platform/users')
      return
    }
    const u = (data as { user?: DetailUser }).user ?? (data as DetailUser)
    user.value = u
    nameDraft.value = u.name ?? ''
    await loadSessions()
  }
  finally {
    loading.value = false
  }
}

async function loadSessions() {
  const { data } = await api.listSessions(id.value)
  sessions.value = ((data as { sessions?: SessionRow[] })?.sessions ?? []) as SessionRow[]
}
onMounted(load)

async function saveName() {
  savingName.value = true
  try {
    const { error } = await api.update({ userId: id.value, data: { name: nameDraft.value } })
    if (error)
      throw new Error(error.message ?? 'Failed to update')
    toast.add({ title: 'Saved', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    savingName.value = false
  }
}

async function toggleRole() {
  if (!user.value)
    return
  const next = user.value.role === 'admin' ? 'user' : 'admin'
  if (!confirm(`Change system role to "${next}"?`))
    return
  try {
    const { error } = await api.setRole(id.value, next)
    if (error)
      throw new Error(error.message ?? 'Failed')
    toast.add({ title: 'Role updated', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Failed', description: (err as Error).message, color: 'error' })
  }
}

async function unban() {
  try {
    const { error } = await api.unban(id.value)
    if (error)
      throw new Error(error.message ?? 'Failed')
    toast.add({ title: 'User unbanned', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Failed', description: (err as Error).message, color: 'error' })
  }
}

async function revokeSession(token: string) {
  await api.revokeSession(token)
  toast.add({ title: 'Session revoked', color: 'success' })
  await loadSessions()
}

async function revokeAllSessions() {
  await api.revokeSessions(id.value)
  toast.add({ title: 'All sessions revoked', color: 'success' })
  await loadSessions()
}

async function impersonate() {
  const { error } = await api.impersonate(id.value)
  if (error) {
    toast.add({ title: 'Impersonation failed', description: error.message, color: 'error' })
    return
  }
  await fetchSession({ force: true })
  await navigateTo('/')
  if (import.meta.client)
    window.location.reload()
}

const canImpersonate = computed(() => !isSelf.value && user.value?.role !== 'admin' && !isImpersonating.value)

const banOpen = ref(false)
const pwOpen = ref(false)
const deleteOpen = ref(false)

const sessionColumns: TableColumn<SessionRow>[] = [
  { id: 'device', header: 'Device', cell: ({ row }) => h('div', [h('p', { class: 'text-sm truncate max-w-xs' }, row.original.userAgent ?? 'Unknown'), h('p', { class: 'text-xs text-muted' }, row.original.ipAddress ?? '')]) },
  { id: 'created', header: 'Signed in', cell: ({ row }) => new Date(row.original.createdAt).toLocaleString() },
  { id: 'actions', header: '', meta: { class: { td: 'text-right' } }, cell: ({ row }) => h(UButton, { color: 'error', variant: 'ghost', size: 'xs', label: 'Revoke', disabled: isImpersonating.value, onClick: () => revokeSession(row.original.token) }) },
]
</script>

<template>
  <UDashboardPanel id="platform-user-detail">
    <template #header>
      <DashboardNavbar :title="user?.name || user?.email || 'User'">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" variant="ghost" to="/platform/users" aria-label="Back" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <UAlert v-if="isImpersonating" color="warning" variant="subtle" icon="i-lucide-shield-alert" title="Mutations disabled" description="You're impersonating another user — administrative actions are locked." class="mb-4" />

      <div v-if="loading" class="space-y-3 max-w-4xl">
        <USkeleton class="h-40 w-full" />
      </div>

      <div v-else-if="user" class="grid gap-6 lg:grid-cols-2 max-w-5xl">
        <!-- Profile -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Profile
            </h2>
          </template>
          <div class="space-y-4">
            <UFormField label="Name">
              <div class="flex gap-2">
                <UInput v-model="nameDraft" class="w-full" :disabled="isImpersonating" />
                <UButton label="Save" :loading="savingName" :disabled="isImpersonating || nameDraft === (user.name ?? '')" @click="saveName" />
              </div>
            </UFormField>
            <UFormField label="Email">
              <div class="flex items-center gap-2">
                <UInput :model-value="user.email" disabled class="w-full" />
                <UBadge :color="user.emailVerified ? 'success' : 'warning'" variant="subtle">
                  {{ user.emailVerified ? 'Verified' : 'Unverified' }}
                </UBadge>
              </div>
            </UFormField>
          </div>
        </UCard>

        <!-- System role -->
        <UCard v-if="!isSelf">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              System role
            </h2>
          </template>
          <div class="flex items-center justify-between gap-4">
            <UBadge :color="user.role === 'admin' ? 'primary' : 'neutral'" variant="subtle">
              {{ user.role ?? 'user' }}
            </UBadge>
            <UButton variant="subtle" :label="user.role === 'admin' ? 'Demote to user' : 'Promote to admin'" :disabled="isImpersonating" @click="toggleRole" />
          </div>
        </UCard>

        <!-- Account status -->
        <UCard v-if="!isSelf">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Account status
            </h2>
          </template>
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <UBadge :color="user.banned ? 'error' : 'success'" variant="subtle">
                {{ user.banned ? 'Banned' : 'Active' }}
              </UBadge>
              <UButton v-if="user.banned" variant="subtle" label="Unban" :disabled="isImpersonating" @click="unban" />
              <UButton v-else color="error" variant="subtle" label="Ban user" :disabled="isImpersonating" @click="banOpen = true" />
            </div>
            <UButton variant="ghost" icon="i-lucide-key-round" label="Set password" :disabled="isImpersonating" @click="pwOpen = true" />
          </div>
        </UCard>

        <!-- Impersonation -->
        <UCard v-if="canImpersonate">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Impersonation
            </h2>
          </template>
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm text-muted">
              Sign in as this user to troubleshoot.
            </p>
            <UButton icon="i-lucide-user-cog" variant="subtle" label="Impersonate" @click="impersonate" />
          </div>
        </UCard>

        <!-- Sessions -->
        <UCard class="lg:col-span-2" :ui="{ body: 'sm:p-0' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-highlighted">
                Active sessions
              </h2>
              <UButton v-if="sessions.length" color="error" variant="subtle" size="xs" label="Revoke all" :disabled="isImpersonating" @click="revokeAllSessions" />
            </div>
          </template>
          <UTable :columns="sessionColumns" :data="sessions">
            <template #empty>
              <div class="text-center text-muted py-6">
                No active sessions.
              </div>
            </template>
          </UTable>
        </UCard>

        <!-- Danger zone -->
        <UCard v-if="!isSelf" class="lg:col-span-2" :ui="{ root: 'ring-error/50' }">
          <template #header>
            <h2 class="font-semibold text-error">
              Danger zone
            </h2>
          </template>
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm text-muted">
              Permanently delete this user.
            </p>
            <UButton color="error" variant="subtle" label="Delete user" :disabled="isImpersonating" @click="deleteOpen = true" />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <PlatformUserBanModal v-if="user" v-model:open="banOpen" :user-id="user.id" @banned="load" />
  <PlatformUserSetPasswordModal v-if="user" v-model:open="pwOpen" :user-id="user.id" />
  <PlatformUserDeleteModal v-if="user" v-model:open="deleteOpen" :user-id="user.id" :email="user.email" />
</template>
