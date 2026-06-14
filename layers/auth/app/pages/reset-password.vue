<script setup lang="ts">
import * as z from 'zod'

definePageMeta({ layout: 'auth', public: true })

const route = useRoute()
const client = useAuthClient()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : undefined))
const invalid = computed(() => route.query.error === 'INVALID_TOKEN' || !token.value)
const error = ref('')
const loading = ref(false)
const done = ref(false)

const schema = z.object({ password: z.string().min(8, 'At least 8 characters') })
type Schema = z.output<typeof schema>
const state = reactive({ password: '' })

async function onSubmit(event: { data: Schema }) {
  error.value = ''
  const resetToken = token.value
  if (!resetToken) {
    error.value = 'Missing or invalid reset token.'
    return
  }
  loading.value = true
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.resetPassword({ newPassword: event.data.password, token: resetToken })
  loading.value = false
  if (e) {
    error.value = e.message ?? 'Could not reset password'
    return
  }
  done.value = true
}
</script>

<template>
  <UCard>
    <div v-if="done" class="space-y-3">
      <h1 class="text-lg font-semibold text-highlighted">
        Password updated
      </h1>
      <p class="text-sm text-muted">
        Your password was changed and other sessions were signed out.
      </p>
      <ULink to="/sign-in" class="text-sm text-primary block">
        Sign in
      </ULink>
    </div>

    <div v-else-if="invalid" class="space-y-3">
      <h1 class="text-lg font-semibold text-highlighted">
        Link expired
      </h1>
      <p class="text-sm text-muted">
        This reset link is invalid or has expired.
      </p>
      <ULink to="/forgot-password" class="text-sm text-primary block">
        Request a new link
      </ULink>
    </div>

    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <template #default>
        <h1 class="text-lg font-semibold text-highlighted">
          Choose a new password
        </h1>
        <UFormField label="New password" name="password" required help="Minimum 8 characters">
          <UInput v-model="state.password" type="password" placeholder="••••••••" class="w-full" autofocus />
        </UFormField>

        <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" />

        <UButton type="submit" label="Set new password" block :loading="loading" />
      </template>
    </UForm>
  </UCard>
</template>
