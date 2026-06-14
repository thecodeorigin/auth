<script setup lang="ts">
import * as z from 'zod'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface ApiKeyDetail {
  id: string
  name: string | null
  start: string | null
  enabled: boolean
  createdAt: string | Date
  expiresAt: string | Date | null
}

const route = useRoute()
const api = useApiKeysApi()
const toast = useToast()
const id = computed(() => String(route.params.id))

const key = ref<ApiKeyDetail | null>(null)
const loading = ref(true)
const saving = ref(false)
const togglingEnabled = ref(false)
const deleting = ref(false)

const schema = z.object({ name: z.string().min(1, 'Name is required').max(255) })
type Schema = z.output<typeof schema>
const state = reactive({ name: '' })

async function load() {
  loading.value = true
  try {
    const { data, error } = await api.get(id.value)
    if (error || !data) {
      toast.add({ title: 'API key not found', color: 'error' })
      await navigateTo('/account/api-keys')
      return
    }
    key.value = data as ApiKeyDetail
    state.name = key.value.name ?? ''
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function save(event: { data: Schema }) {
  saving.value = true
  try {
    const { error } = await api.update({ keyId: id.value, name: event.data.name })
    if (error)
      throw new Error(error.message ?? 'Failed to update')
    toast.add({ title: 'Saved', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function toggleEnabled(value: boolean) {
  togglingEnabled.value = true
  try {
    const { error } = await api.update({ keyId: id.value, enabled: value })
    if (error)
      throw new Error(error.message ?? 'Failed to update')
    if (key.value)
      key.value.enabled = value
    toast.add({ title: value ? 'Key enabled' : 'Key disabled', color: 'success' })
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: (err as Error).message, color: 'error' })
    await load()
  }
  finally {
    togglingEnabled.value = false
  }
}

async function remove() {
  deleting.value = true
  try {
    const { error } = await api.remove(id.value)
    if (error)
      throw new Error(error.message ?? 'Failed to delete')
    toast.add({ title: 'Key deleted', color: 'success' })
    await navigateTo('/account/api-keys')
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

function fmt(d: string | Date | null) {
  return d ? new Date(d).toLocaleString() : 'No expiry'
}
</script>

<template>
  <UDashboardPanel id="account-api-key-detail">
    <template #header>
      <DashboardNavbar :title="key?.name ?? 'API Key'">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" variant="ghost" to="/account/api-keys" aria-label="Back" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="space-y-3 max-w-3xl">
        <USkeleton class="h-40 w-full" />
      </div>

      <div v-else-if="key" class="grid gap-6 lg:grid-cols-3 max-w-4xl">
        <div class="lg:col-span-2 space-y-6">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Details
              </h2>
            </template>
            <UForm :schema="schema" :state="state" class="space-y-4" @submit="save">
              <UFormField label="Name" name="name" required>
                <UInput v-model="state.name" class="w-full" />
              </UFormField>
              <div class="flex justify-end">
                <UButton type="submit" label="Save" :loading="saving" />
              </div>
            </UForm>
          </UCard>

          <UCard :ui="{ root: 'ring-error/50' }">
            <template #header>
              <h2 class="font-semibold text-error">
                Danger zone
              </h2>
            </template>
            <div class="flex items-center justify-between gap-4">
              <p class="text-sm text-muted">
                Delete this key permanently. Apps using it will stop working.
              </p>
              <UButton color="error" variant="subtle" label="Delete key" :loading="deleting" @click="remove" />
            </div>
          </UCard>
        </div>

        <div class="space-y-6">
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">
                Key info
              </h2>
            </template>
            <dl class="space-y-3 text-sm">
              <div>
                <dt class="text-muted">
                  Prefix
                </dt>
                <dd class="font-mono">
                  {{ key.start ?? '—' }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">
                  Created
                </dt>
                <dd>{{ fmt(key.createdAt) }}</dd>
              </div>
              <div>
                <dt class="text-muted">
                  Expires
                </dt>
                <dd>{{ fmt(key.expiresAt) }}</dd>
              </div>
              <div class="flex items-center justify-between pt-2">
                <dt class="text-muted">
                  Enabled
                </dt>
                <USwitch :model-value="key.enabled" :loading="togglingEnabled" @update:model-value="toggleEnabled" />
              </div>
            </dl>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
