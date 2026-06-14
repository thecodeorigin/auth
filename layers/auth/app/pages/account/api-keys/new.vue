<script setup lang="ts">
import * as z from 'zod'
import ApiKeyRevealModal from '#layers/auth/app/components/ApiKey/ApiKeyRevealModal.vue'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const api = useApiKeysApi()
const toast = useToast()

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  expiresInDays: z.coerce.number().int().positive().optional(),
})
type Schema = z.output<typeof schema>
const state = reactive<{ name: string, expiresInDays?: number }>({ name: '' })

const submitting = ref(false)
const revealOpen = ref(false)
const createdKey = ref<string | null>(null)
const createdId = ref<string | null>(null)

async function onSubmit(event: { data: Schema }) {
  submitting.value = true
  try {
    const { data, error } = await api.create({
      name: event.data.name,
      expiresIn: event.data.expiresInDays ? event.data.expiresInDays * 86400 : null,
    })
    if (error)
      throw new Error(error.message ?? 'Failed to create API key')
    const result = data as { id: string, key: string }
    createdKey.value = result.key
    createdId.value = result.id
    revealOpen.value = true
  }
  catch (err) {
    toast.add({ title: 'Create failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}

function onAcknowledged() {
  createdKey.value = null
  if (createdId.value)
    navigateTo(`/account/api-keys/${createdId.value}`)
  else
    navigateTo('/account/api-keys')
}
</script>

<template>
  <UDashboardPanel id="account-api-key-new">
    <template #header>
      <DashboardNavbar title="Create API Key">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" variant="ghost" to="/account/api-keys" aria-label="Back" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-xl">
        <UCard>
          <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
            <UFormField label="Name" name="name" required help="A label to recognise this key.">
              <UInput v-model="state.name" placeholder="e.g. CI pipeline" class="w-full" autofocus />
            </UFormField>
            <UFormField label="Expires in (days)" name="expiresInDays" help="Leave blank for a key that never expires.">
              <UInput v-model="state.expiresInDays" type="number" min="1" placeholder="No expiry" class="w-full" />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" label="Cancel" to="/account/api-keys" />
              <UButton type="submit" label="Create key" :loading="submitting" />
            </div>
          </UForm>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <ApiKeyRevealModal v-model:open="revealOpen" :api-key="createdKey" @acknowledged="onAcknowledged" />
</template>
