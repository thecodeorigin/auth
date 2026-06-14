<script setup lang="ts">
import * as z from 'zod'

const props = defineProps<{ userId: string }>()
const open = defineModel<boolean>('open', { default: false })

const api = useUsersApi()
const toast = useToast()

const schema = z.object({ newPassword: z.string().min(8, 'At least 8 characters') })
type Schema = z.output<typeof schema>
const state = reactive({ newPassword: '' })
const submitting = ref(false)
const show = ref(false)

watch(open, (v) => {
  if (!v) {
    state.newPassword = ''
    show.value = false
  }
})

async function onSubmit(event: { data: Schema }) {
  submitting.value = true
  try {
    const { error } = await api.setPassword(props.userId, event.data.newPassword)
    if (error)
      throw new Error(error.message ?? 'Failed to set password')
    toast.add({ title: 'Password set', color: 'success' })
    open.value = false
  }
  catch (err) {
    toast.add({ title: 'Failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Set password">
    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UAlert color="warning" variant="soft" icon="i-lucide-info" title="The user will not be notified" description="Consider revoking their sessions afterwards if a compromise is suspected." />
        <UFormField label="New password" name="newPassword" required help="Minimum 8 characters">
          <UInput v-model="state.newPassword" :type="show ? 'text' : 'password'" class="w-full">
            <template #trailing>
              <UButton :icon="show ? 'i-lucide-eye-off' : 'i-lucide-eye'" variant="link" color="neutral" size="xs" :aria-label="show ? 'Hide' : 'Show'" @click="show = !show" />
            </template>
          </UInput>
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton type="submit" label="Set password" :loading="submitting" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
