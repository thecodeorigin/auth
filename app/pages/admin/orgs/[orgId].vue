<script setup lang="ts">
interface MemberRow {
  userId: string
  email: string
  role: string
}
interface ScopeRow {
  clientId: string
  role: string | null
}
interface ClientItem {
  clientId: string
  name: string | null
  disabled: boolean
}

const route = useRoute()
const orgId = computed(() => String(route.params.orgId))
const { loggedIn, fetchSession } = useUserSession()

const members = ref<MemberRow[]>([])
const clients = ref<ClientItem[]>([])
const selectedUserId = ref('')
const scopes = ref<ScopeRow[]>([])
const grantClientId = ref('*')
const grantRole = ref('')
const error = ref('')

async function loadMembers() {
  const client = useAuthClient()
  if (!client)
    return
  const { data, error: e } = await client.organization.listMembers({ query: { organizationId: orgId.value } })
  if (e) {
    error.value = e.message ?? 'Failed to list members (are you an admin of this org?)'
    return
  }
  members.value = (data?.members ?? []).map(m => ({ userId: m.userId, email: m.user?.email ?? m.userId, role: m.role }))
}

async function loadClients() {
  clients.value = await $fetch<ClientItem[]>('/api/auth/oauth2/clients').catch(() => [])
}

async function selectMember(userId: string) {
  error.value = ''
  selectedUserId.value = userId
  scopes.value = await $fetch<ScopeRow[]>(`/api/orgs/${orgId.value}/members/${userId}/app-scopes`).catch((e) => {
    error.value = e?.data?.statusMessage ?? 'Failed to load scopes'
    return []
  })
}

async function grant() {
  if (!selectedUserId.value)
    return
  error.value = ''
  try {
    await $fetch(`/api/orgs/${orgId.value}/members/${selectedUserId.value}/app-scopes`, {
      method: 'POST',
      body: { clientId: grantClientId.value, role: grantRole.value.trim() || undefined },
    })
    await selectMember(selectedUserId.value)
  }
  catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Grant failed'
  }
}

async function revoke(clientId: string) {
  if (!selectedUserId.value)
    return
  error.value = ''
  try {
    await $fetch(`/api/orgs/${orgId.value}/members/${selectedUserId.value}/app-scopes/${encodeURIComponent(clientId)}`, { method: 'DELETE' })
    await selectMember(selectedUserId.value)
  }
  catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } })?.data?.statusMessage ?? 'Revoke failed'
  }
}

onMounted(async () => {
  if (!import.meta.client)
    return
  await fetchSession({ force: true })
  if (!loggedIn.value) {
    await navigateTo('/sign-in')
    return
  }
  await Promise.all([loadMembers(), loadClients()])
})
</script>

<template>
  <div style="max-width: 48rem; margin: 3rem auto; font-family: system-ui;">
    <h1 style="font-size: 1.25rem; font-weight: 600;">
      Org access · {{ orgId }}
    </h1>
    <p style="color: #555; font-size: 0.875rem;">
      Grant a member access to all apps (<code>*</code>) or to specific applications. Default-closed:
      a member with no grants has no access to any app in this org.
    </p>
    <p v-if="error" style="color: #c00; font-size: 0.875rem;">
      {{ error }}
    </p>

    <div style="display: flex; gap: 2rem; margin-top: 1rem;">
      <div style="flex: 1;">
        <h2 style="font-size: 1rem; font-weight: 600;">
          Members
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
          <tbody>
            <tr v-for="m in members" :key="m.userId" style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 0.4rem;">
                {{ m.email }}
                <span style="color: #888;">({{ m.role }})</span>
              </td>
              <td style="padding: 0.4rem; text-align: right;">
                <button @click="selectMember(m.userId)">
                  Manage
                </button>
              </td>
            </tr>
            <tr v-if="!members.length">
              <td style="padding: 0.4rem; color: #777;">
                No members loaded.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="selectedUserId" style="flex: 1;">
        <h2 style="font-size: 1rem; font-weight: 600;">
          Grants
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
          <tbody>
            <tr v-for="s in scopes" :key="s.clientId" style="border-bottom: 1px solid #f0f0f0;">
              <td style="padding: 0.4rem;">
                <code>{{ s.clientId === '*' ? '* (all apps)' : s.clientId }}</code>
                <span v-if="s.role" style="color: #888;"> · {{ s.role }}</span>
              </td>
              <td style="padding: 0.4rem; text-align: right;">
                <button @click="revoke(s.clientId)">
                  Revoke
                </button>
              </td>
            </tr>
            <tr v-if="!scopes.length">
              <td style="padding: 0.4rem; color: #777;">
                No grants — denied everywhere in this org.
              </td>
            </tr>
          </tbody>
        </table>

        <form style="margin-top: 1rem; display: flex; gap: 0.4rem; align-items: flex-end;" @submit.prevent="grant">
          <label style="display: flex; flex-direction: column; font-size: 0.8rem; color: #555;">
            Application
            <select v-model="grantClientId" style="padding: 0.4rem;">
              <option value="*">
                * (all apps)
              </option>
              <option v-for="c in clients" :key="c.clientId" :value="c.clientId">
                {{ c.name ?? c.clientId }}
              </option>
            </select>
          </label>
          <label style="display: flex; flex-direction: column; font-size: 0.8rem; color: #555;">
            Role (optional)
            <input v-model="grantRole" style="padding: 0.4rem;" placeholder="inherit">
          </label>
          <button type="submit" style="padding: 0.5rem 0.75rem;">
            Grant
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
