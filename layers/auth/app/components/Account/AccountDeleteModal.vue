<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })

const { user, signOut } = useUserSession()
const account = useAccountApi()
const toast = useToast()

const confirmEmail = ref('')
const deleting = ref(false)

const matches = computed(() =>
  confirmEmail.value.trim().toLowerCase() === (user.value?.email ?? '').toLowerCase())

watch(open, (v) => {
  if (!v)
    confirmEmail.value = ''
})

async function confirmDelete() {
  if (!matches.value)
    return
  deleting.value = true
  try {
    const { error } = await account.deleteSelf({ callbackURL: '/sign-in' })
    if (error)
      throw new Error(error.message ?? 'Failed to delete account')
    await signOut().catch(() => {})
    toast.add({ title: 'Account deleted', color: 'success' })
    await navigateTo('/sign-in')
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
  <UModal v-model:open="open" title="Delete account">
    <template #body>
      <div class="space-y-4">
        <UAlert
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="This action is permanent"
          description="Your account and all associated data will be permanently deleted. This cannot be undone."
        />
        <UFormField :label="`Type ${user?.email} to confirm`">
          <UInput v-model="confirmEmail" placeholder="your email" class="w-full" autocomplete="off" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton color="error" label="Delete account" :disabled="!matches" :loading="deleting" @click="confirmDelete" />
        </div>
      </div>
    </template>
  </UModal>
</template>
