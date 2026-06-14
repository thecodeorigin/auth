<script setup lang="ts">
import * as z from 'zod'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface FullOrg {
  id: string
  name: string
  slug: string
  logo?: string | null
  metadata?: string | null
}

const route = useRoute()
const orgApi = useOrgApi()
const toast = useToast()
const { fetchSession } = useUserSession()
const slug = computed(() => String(route.params.slug))

const { data: org, pending, error, refresh } = await useAsyncData(
  () => `org-settings-${slug.value}`,
  async () => {
    const { data, error: e } = await orgApi.getFull({ organizationSlug: slug.value })
    if (e)
      throw new Error(e.message ?? 'Organization not found')
    return data as FullOrg
  },
  { server: false },
)

const role = ref<string | null>(null)
onMounted(async () => {
  const { data } = await orgApi.getActiveMemberRole()
  role.value = (data as { role?: string } | null)?.role ?? null
})
const isOwner = computed(() => role.value === 'owner')

const isPersonal = computed(() => {
  try {
    return JSON.parse(org.value?.metadata ?? '{}')?.personal === true
  }
  catch {
    return false
  }
})

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers and hyphens only'),
  logo: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
})
type Schema = z.output<typeof schema>
const state = reactive({ name: '', slug: '', logo: '' })

watch(org, (o) => {
  state.name = o?.name ?? ''
  state.slug = o?.slug ?? ''
  state.logo = o?.logo ?? ''
}, { immediate: true })

const saving = ref(false)

async function onSubmit(event: { data: Schema }) {
  if (!org.value)
    return
  saving.value = true
  try {
    const { error: e } = await orgApi.update({
      organizationId: org.value.id,
      data: { name: event.data.name, slug: event.data.slug, logo: event.data.logo || undefined },
    })
    if (e)
      throw new Error(e.message ?? 'Failed to update organization')
    toast.add({ title: 'Organization updated', color: 'success' })
    await refresh()
    if (event.data.slug !== slug.value)
      await navigateTo(`/orgs/${event.data.slug}/settings`)
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// Delete
const deleteOpen = ref(false)
const confirmSlug = ref('')
const deleting = ref(false)
const canConfirmDelete = computed(() => confirmSlug.value.trim() === org.value?.slug)

async function confirmDelete() {
  if (!org.value || !canConfirmDelete.value)
    return
  deleting.value = true
  try {
    const { error: e } = await orgApi.remove(org.value.id)
    if (e)
      throw new Error(e.message ?? 'Failed to delete organization')
    await orgApi.setActive(null)
    await fetchSession({ force: true })
    toast.add({ title: 'Organization deleted', color: 'success' })
    await navigateTo('/')
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="org-settings">
    <template #header>
      <DashboardNavbar :title="`${org?.name ?? 'Organization'} · Settings`" />
    </template>

    <template #body>
      <div v-if="pending" class="max-w-2xl">
        <USkeleton class="h-48 w-full" />
      </div>

      <UAlert v-else-if="error" color="error" variant="soft" icon="i-lucide-circle-alert" title="Can't open settings" :description="error.message" />

      <div v-else class="max-w-2xl space-y-6">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              General
            </h2>
          </template>
          <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
            <UFormField label="Name" name="name" required>
              <UInput v-model="state.name" class="w-full" />
            </UFormField>
            <UFormField label="Slug" name="slug" required>
              <UInput v-model="state.slug" class="w-full font-mono" :disabled="isPersonal" />
            </UFormField>
            <UFormField label="Logo URL" name="logo">
              <UInput v-model="state.logo" placeholder="https://…" class="w-full" />
            </UFormField>
            <div class="flex justify-end">
              <UButton type="submit" label="Save changes" :loading="saving" />
            </div>
          </UForm>
        </UCard>

        <UCard v-if="isOwner && !isPersonal" :ui="{ root: 'ring-error/50' }">
          <template #header>
            <h2 class="font-semibold text-error">
              Danger zone
            </h2>
          </template>
          <div class="flex items-center justify-between gap-4">
            <p class="text-sm text-muted">
              Delete this organization and all its data. This cannot be undone.
            </p>
            <UButton color="error" variant="subtle" label="Delete organization" @click="deleteOpen = true" />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <UModal v-model:open="deleteOpen" title="Delete organization">
    <template #body>
      <div class="space-y-4">
        <UAlert color="error" variant="soft" icon="i-lucide-triangle-alert" title="This is permanent" :description="`All members, roles and grants for ${org?.name} will be removed.`" />
        <UFormField :label="`Type ${org?.slug} to confirm`">
          <UInput v-model="confirmSlug" class="w-full font-mono" autocomplete="off" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="deleteOpen = false" />
          <UButton color="error" label="Delete" :disabled="!canConfirmDelete" :loading="deleting" @click="confirmDelete" />
        </div>
      </div>
    </template>
  </UModal>
</template>
