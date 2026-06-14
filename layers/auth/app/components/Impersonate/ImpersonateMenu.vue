<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

interface Candidate { id: string, name?: string | null, email: string, banned?: boolean | null }

defineProps<{ collapsed?: boolean }>()

const { user, session, fetchSession } = useUserSession()
const usersApi = useUsersApi()
const toast = useToast()
const { $ability } = useNuxtApp()

const isImpersonating = computed(() => !!session.value?.impersonatedBy)
const canManageUsers = computed(() => $ability.can('read', 'user') || $ability.can('manage', 'all'))
const showMenu = computed(() => canManageUsers.value || isImpersonating.value)

const candidatesOpen = ref(false)
const q = ref('')
const candidates = ref<Candidate[]>([])
const loading = ref(false)
const busy = ref(false)

async function loadCandidates() {
  loading.value = true
  try {
    const { data } = await usersApi.list({ searchValue: q.value || undefined, limit: 20 })
    candidates.value = (data?.users ?? []).map(u => ({ id: u.id, name: u.name, email: u.email, banned: u.banned }))
  }
  finally {
    loading.value = false
  }
}

watch(candidatesOpen, (val) => {
  if (val)
    loadCandidates()
})
watchDebounced(q, () => {
  if (candidatesOpen.value)
    loadCandidates()
}, { debounce: 300 })

async function startImpersonation(userId: string, label: string) {
  busy.value = true
  candidatesOpen.value = false
  try {
    const { error } = await usersApi.impersonate(userId)
    if (error)
      throw new Error(error.message ?? 'Impersonation failed')
    toast.add({ title: `Now impersonating ${label}`, color: 'success' })
    await fetchSession({ force: true })
    if (import.meta.client)
      window.location.reload()
  }
  catch (err) {
    toast.add({ title: 'Impersonation failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    busy.value = false
  }
}

async function stopImpersonation() {
  busy.value = true
  try {
    await usersApi.stopImpersonating()
    toast.add({ title: 'Stopped impersonation', color: 'success' })
    await fetchSession({ force: true })
    if (import.meta.client)
      window.location.reload()
  }
  catch (err) {
    toast.add({ title: 'Stop impersonation failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const triggerLabel = computed(() => isImpersonating.value
  ? (user.value?.name || user.value?.email || 'user')
  : 'Impersonate')

const stopItems = computed<DropdownMenuItem[][]>(() => [[
  { label: `Impersonating: ${user.value?.email ?? ''}`, icon: 'i-lucide-shield', disabled: true },
  { label: 'Stop impersonating', icon: 'i-lucide-log-out', color: 'warning' as const, onSelect: () => { void stopImpersonation() } },
]])
</script>

<template>
  <div v-if="showMenu">
    <UDropdownMenu
      v-if="isImpersonating"
      :items="stopItems"
      :content="{ align: 'center', collisionPadding: 12 }"
      :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width)' }"
    >
      <UButton
        icon="i-lucide-user-cog"
        :label="collapsed ? undefined : triggerLabel"
        :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
        color="warning"
        variant="soft"
        block
        :square="collapsed"
        class="data-[state=open]:bg-elevated py-2"
        :ui="{ trailingIcon: 'text-dimmed' }"
        data-testid="impersonate-menu-trigger"
      />
    </UDropdownMenu>

    <UPopover
      v-else
      v-model:open="candidatesOpen"
      :content="{ align: 'center', collisionPadding: 12 }"
    >
      <UButton
        icon="i-lucide-cuboid"
        :label="collapsed ? undefined : triggerLabel"
        :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="data-[state=open]:bg-elevated py-2"
        :ui="{ trailingIcon: 'text-dimmed' }"
        data-testid="impersonate-menu-trigger"
      />

      <template #content>
        <div class="w-56">
          <div class="p-2 border-b border-default">
            <UInput v-model="q" icon="i-lucide-search" placeholder="Search users…" size="sm" autofocus />
          </div>
          <div class="max-h-60 overflow-y-auto py-1">
            <button
              v-for="cand in candidates"
              :key="cand.id"
              type="button"
              :disabled="!!cand.banned || busy"
              class="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-elevated cursor-pointer text-left disabled:opacity-50 disabled:cursor-not-allowed"
              @click="startImpersonation(cand.id, cand.name ?? cand.email)"
            >
              <UIcon name="i-lucide-user" class="size-4 shrink-0" />
              <span class="truncate">{{ cand.name ?? cand.email }}</span>
            </button>
            <div v-if="loading" class="px-3 py-1.5 text-sm text-muted">
              Loading…
            </div>
            <div v-else-if="candidates.length === 0" class="px-3 py-1.5 text-sm text-muted">
              No users available.
            </div>
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>
