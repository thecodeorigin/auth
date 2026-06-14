<script setup lang="ts">
const props = defineProps<{ userId: string }>()
const emit = defineEmits<{ banned: [] }>()
const open = defineModel<boolean>('open', { default: false })
const api = useUsersApi()
const toast = useToast()

const reason = ref('')
const expiresInDays = ref<number | undefined>(undefined)
const submitting = ref(false)

watch(open, (v) => {
  if (!v) {
    reason.value = ''
    expiresInDays.value = undefined
  }
})

async function submit() {
  submitting.value = true
  try {
    const { error } = await api.ban({
      userId: props.userId,
      banReason: reason.value || undefined,
      banExpiresIn: expiresInDays.value ? expiresInDays.value * 86400 : undefined,
    })
    if (error)
      throw new Error(error.message ?? 'Failed to ban user')
    toast.add({ title: 'User banned', color: 'success' })
    open.value = false
    emit('banned')
  }
  catch (err) {
    toast.add({ title: 'Ban failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="Ban user">
    <template #body>
      <div class="space-y-4">
        <UAlert color="warning" variant="soft" icon="i-lucide-triangle-alert" title="Banning blocks sign-in" description="The user won't be able to sign in. Existing sessions may persist until they expire — revoke sessions separately if needed." />
        <UFormField label="Reason" help="Optional, max 500 characters.">
          <UTextarea v-model="reason" :maxlength="500" placeholder="Policy violation…" class="w-full" />
        </UFormField>
        <UFormField label="Expires in (days)" help="Leave blank for a permanent ban.">
          <UInput v-model="expiresInDays" type="number" min="1" placeholder="Permanent" class="w-full" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="error" label="Ban user" :loading="submitting" @click="submit" />
        </div>
      </div>
    </template>
  </UModal>
</template>
