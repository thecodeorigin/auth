<script setup lang="ts">
import * as z from 'zod'
import AccountDeleteModal from '#layers/auth/app/components/Account/AccountDeleteModal.vue'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

const { user } = useUserSession()
const deleteOpen = ref(false)
const account = useAccountApi()
const toast = useToast()

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  image: z.string().url('Enter a valid URL').or(z.literal('')).optional(),
})
type Schema = z.output<typeof schema>

const state = reactive({
  name: user.value?.name ?? '',
  image: user.value?.image ?? '',
})

watch(user, (u) => {
  state.name = u?.name ?? ''
  state.image = u?.image ?? ''
})

const saving = ref(false)

const avatarSrc = computed(() => state.image || user.value?.image || undefined)

async function onSubmit(event: { data: Schema }) {
  saving.value = true
  try {
    await account.update({ name: event.data.name, image: event.data.image || null })
    toast.add({ title: 'Profile updated', color: 'success' })
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="account-profile">
    <template #header>
      <DashboardNavbar title="Profile" />
    </template>

    <template #body>
      <div class="max-w-2xl space-y-6">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Personal information
            </h2>
          </template>

          <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
            <div class="flex items-center gap-4">
              <UAvatar :src="avatarSrc" :alt="state.name" size="xl" :text="(state.name || user?.email || '?').charAt(0).toUpperCase()" />
              <div class="flex-1">
                <UFormField label="Avatar URL" name="image">
                  <UInput v-model="state.image" placeholder="https://…" class="w-full" />
                </UFormField>
              </div>
            </div>

            <UFormField label="Name" name="name" required>
              <UInput v-model="state.name" class="w-full" />
            </UFormField>

            <UFormField label="Email">
              <UInput :model-value="user?.email" disabled class="w-full" />
            </UFormField>

            <UFormField label="Account ID">
              <UInput :model-value="user?.id" disabled class="w-full font-mono text-xs" />
            </UFormField>

            <div class="flex justify-end">
              <UButton type="submit" label="Save changes" :loading="saving" />
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
              Permanently delete your account and all associated data.
            </p>
            <UButton color="error" variant="subtle" label="Delete account" @click="deleteOpen = true" />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <AccountDeleteModal v-model:open="deleteOpen" />
</template>
