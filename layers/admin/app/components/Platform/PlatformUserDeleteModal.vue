<script setup lang="ts">
const props = defineProps<{ userId: string, email: string }>()
const open = defineModel<boolean>('open', { default: false })

const api = useUsersApi()
const toast = useToast()

const confirmEmail = ref('')
const deleting = ref(false)
const matches = computed(() => confirmEmail.value.trim().toLowerCase() === props.email.toLowerCase())

watch(open, (v) => {
  if (!v)
    confirmEmail.value = ''
})

async function confirmDelete() {
  if (!matches.value)
    return
  deleting.value = true
  try {
    const { error } = await api.remove(props.userId)
    if (error)
      throw new Error(error.message ?? 'Failed to delete user')
    toast.add({ title: 'User deleted', color: 'success' })
    await navigateTo('/platform/users')
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
  <UModal v-model:open="open" title="Delete user">
    <template #body>
      <div class="space-y-4">
        <UAlert color="error" variant="soft" icon="i-lucide-triangle-alert" title="This is permanent" description="The user and their data will be permanently removed. This cannot be undone." />
        <UFormField :label="`Type ${email} to confirm`">
          <UInput v-model="confirmEmail" class="w-full" autocomplete="off" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="error" label="Delete user" :disabled="!matches" :loading="deleting" @click="confirmDelete" />
        </div>
      </div>
    </template>
  </UModal>
</template>
