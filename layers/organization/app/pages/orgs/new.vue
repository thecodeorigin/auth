<script setup lang="ts">
import * as z from 'zod'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const orgApi = useOrgApi()
const { fetchSession } = useUserSession()
const toast = useToast()

function kebab(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1, 'Slug is required').regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
})
type Schema = z.output<typeof schema>
const state = reactive({ name: '', slug: '' })

const slugTouched = ref(false)
const slugStatus = ref<'idle' | 'checking' | 'available' | 'taken'>('idle')

watch(() => state.name, (name) => {
  if (!slugTouched.value)
    state.slug = kebab(name)
})

watchDebounced(() => state.slug, async (slug) => {
  if (!slug) {
    slugStatus.value = 'idle'
    return
  }
  slugStatus.value = 'checking'
  try {
    const { error } = await orgApi.checkSlug(slug)
    slugStatus.value = error ? 'taken' : 'available'
  }
  catch {
    slugStatus.value = 'taken'
  }
}, { debounce: 400 })

const submitting = ref(false)

async function onSubmit(event: { data: Schema }) {
  submitting.value = true
  try {
    const { data, error } = await orgApi.create({ name: event.data.name, slug: event.data.slug })
    if (error)
      throw new Error(error.message ?? 'Failed to create organization')
    const org = data as { id: string, slug: string }
    await orgApi.setActive(org.id)
    await fetchSession({ force: true })
    toast.add({ title: 'Organization created', color: 'success' })
    await navigateTo(`/orgs/${org.slug}/settings`)
  }
  catch (err) {
    toast.add({ title: 'Create failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="org-new">
    <template #header>
      <DashboardNavbar title="Create organization" />
    </template>

    <template #body>
      <div class="max-w-xl">
        <UCard>
          <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
            <UFormField label="Name" name="name" required>
              <UInput v-model="state.name" placeholder="Acme Corp" class="w-full" autofocus />
            </UFormField>
            <UFormField label="Slug" name="slug" required>
              <UInput v-model="state.slug" class="w-full font-mono" @input="slugTouched = true" />
              <template #help>
                <span v-if="slugStatus === 'checking'" class="text-muted">Checking availability…</span>
                <span v-else-if="slugStatus === 'available'" class="text-success">Available</span>
                <span v-else-if="slugStatus === 'taken'" class="text-error">This slug is taken</span>
                <span v-else class="text-muted">Used in URLs.</span>
              </template>
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" label="Cancel" @click="$router.back()" />
              <UButton type="submit" label="Create" :loading="submitting" :disabled="slugStatus === 'taken'" />
            </div>
          </UForm>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
