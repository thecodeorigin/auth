<script setup lang="ts">
interface OrgRow {
  id: string
  name: string
  slug: string | null
}

const { loggedIn, fetchSession } = useUserSession()

const orgs = ref<OrgRow[]>([])
const error = ref('')
const name = ref('')
const slug = ref('')
const creating = ref(false)

async function load() {
  error.value = ''
  const client = useAuthClient()
  if (!client)
    return
  const { data, error: e } = await client.organization.list()
  if (e) {
    error.value = e.message ?? 'Failed to list organizations'
    return
  }
  orgs.value = (data ?? []).map(item => ({ id: item.id, name: item.name, slug: item.slug }))
}

async function create() {
  error.value = ''
  if (!name.value.trim())
    return
  const client = useAuthClient()
  if (!client)
    return
  creating.value = true
  // slug is required by the org plugin; derive a sane default from the name when omitted.
  const finalSlug = slug.value.trim() || name.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const { error: e } = await client.organization.create({ name: name.value.trim(), slug: finalSlug })
  creating.value = false
  if (e) {
    error.value = e.message ?? 'Failed to create organization'
    return
  }
  name.value = ''
  slug.value = ''
  await load()
}

onMounted(async () => {
  if (!import.meta.client)
    return
  await fetchSession({ force: true })
  if (!loggedIn.value) {
    await navigateTo('/sign-in')
    return
  }
  await load()
})
</script>

<template>
  <div style="max-width: 40rem; margin: 3rem auto; font-family: system-ui;">
    <h1 style="font-size: 1.25rem; font-weight: 600;">
      My organizations
    </h1>
    <p v-if="error" style="color: #c00; font-size: 0.875rem;">
      {{ error }}
    </p>

    <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem; margin-top: 1rem;">
      <thead>
        <tr style="text-align: left; border-bottom: 1px solid #ddd;">
          <th style="padding: 0.4rem;">
            Name
          </th>
          <th style="padding: 0.4rem;">
            Slug
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="o in orgs" :key="o.id" style="border-bottom: 1px solid #f0f0f0;">
          <td style="padding: 0.4rem;">
            {{ o.name }}
          </td>
          <td style="padding: 0.4rem; color: #555;">
            {{ o.slug ?? '—' }}
          </td>
        </tr>
        <tr v-if="!orgs.length">
          <td colspan="2" style="padding: 0.4rem; color: #777;">
            No organizations yet.
          </td>
        </tr>
      </tbody>
    </table>

    <form style="margin-top: 1.5rem; display: flex; gap: 0.4rem; align-items: flex-end;" @submit.prevent="create">
      <label style="display: flex; flex-direction: column; font-size: 0.8rem; color: #555;">
        Name
        <input v-model="name" required style="padding: 0.4rem;" placeholder="Acme Inc">
      </label>
      <label style="display: flex; flex-direction: column; font-size: 0.8rem; color: #555;">
        Slug (optional)
        <input v-model="slug" style="padding: 0.4rem;" placeholder="acme">
      </label>
      <button type="submit" :disabled="creating" style="padding: 0.5rem 0.75rem;">
        {{ creating ? 'Creating…' : 'Create organization' }}
      </button>
    </form>
  </div>
</template>
