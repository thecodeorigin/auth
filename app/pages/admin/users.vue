<script setup lang="ts">
interface AdminUserRow {
  id: string
  email: string
  role?: string | null
}

const { user, fetchSession } = useUserSession()

const users = ref<AdminUserRow[]>([])
const error = ref('')
const impersonating = ref(false)

async function load() {
  error.value = ''
  const client = useAuthClient()
  if (!client)
    return
  const { data, error: e } = await client.admin.listUsers({ query: { limit: 50 } })
  if (e) {
    error.value = e.message ?? 'Failed to list users'
    return
  }
  users.value = (data?.users ?? []).map(item => ({ id: item.id, email: item.email, role: item.role }))
}

async function setRole(userId: string, role: 'admin' | 'user') {
  const client = useAuthClient()
  if (!client)
    return
  const { error: e } = await client.admin.setRole({ userId, role })
  if (e) {
    error.value = e.message ?? 'Failed to set role'
    return
  }
  await load()
}

async function impersonate(userId: string) {
  const client = useAuthClient()
  if (!client)
    return
  const { error: e } = await client.admin.impersonateUser({ userId })
  if (e) {
    error.value = e.message ?? 'Failed to impersonate'
    return
  }
  impersonating.value = true
  await fetchSession({ force: true })
}

async function stopImpersonating() {
  const client = useAuthClient()
  if (!client)
    return
  await client.admin.stopImpersonating()
  impersonating.value = false
  await fetchSession({ force: true })
}

onMounted(async () => {
  if (!import.meta.client)
    return
  await fetchSession({ force: true })
  if (user.value?.role !== 'admin' && !impersonating.value) {
    await navigateTo('/')
    return
  }
  await load()
})
</script>

<template>
  <div style="max-width: 56rem; margin: 3rem auto; font-family: system-ui;">
    <h1 style="font-size: 1.25rem; font-weight: 600;">
      Admin · Users
    </h1>
    <div v-if="impersonating" style="margin: 0.5rem 0; padding: 0.5rem; background: #fff7ed; border: 1px solid #fdba74; border-radius: 4px;">
      Impersonating <strong>{{ user?.email }}</strong>
      <button style="margin-left: 0.5rem;" @click="stopImpersonating">
        Stop impersonating
      </button>
    </div>
    <p v-if="error" style="color: #c00; font-size: 0.875rem;">
      {{ error }}
    </p>
    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-top: 1rem;">
      <thead>
        <tr style="text-align: left; border-bottom: 1px solid #ddd;">
          <th style="padding: 0.4rem;">
            Email
          </th>
          <th style="padding: 0.4rem;">
            Role
          </th>
          <th style="padding: 0.4rem;">
            Actions
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="u in users" :key="u.id" style="border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 0.4rem;">
            {{ u.email }}
          </td>
          <td style="padding: 0.4rem;">
            {{ u.role ?? '—' }}
          </td>
          <td style="padding: 0.4rem; display: flex; gap: 0.4rem;">
            <button @click="setRole(u.id, u.role === 'admin' ? 'user' : 'admin')">
              {{ u.role === 'admin' ? 'Demote' : 'Make admin' }}
            </button>
            <button @click="impersonate(u.id)">
              Impersonate
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
