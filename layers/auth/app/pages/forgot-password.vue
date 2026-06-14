<script setup lang="ts">
import * as z from 'zod'

definePageMeta({ layout: 'auth', public: true })

const client = useAuthClient()
const error = ref('')
const loading = ref(false)
const sent = ref(false)

const schema = z.object({ email: z.string().email('Enter a valid email') })
type Schema = z.output<typeof schema>
const state = reactive({ email: '' })

async function onSubmit(event: { data: Schema }) {
  error.value = ''
  loading.value = true
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.requestPasswordReset({
    email: event.data.email,
    redirectTo: `${window.location.origin}/reset-password`,
  })
  loading.value = false
  if (e) {
    error.value = e.message ?? 'Could not send reset link'
    return
  }
  sent.value = true
}
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold text-highlighted">
        Reset your password
      </h1>
    </template>

    <div v-if="sent" class="space-y-3">
      <p class="text-sm text-muted">
        If an account exists for <strong class="text-highlighted">{{ state.email }}</strong>, a reset link is on its way.
      </p>
      <ULink to="/sign-in" class="text-sm text-primary block">
        Back to sign in
      </ULink>
    </div>

    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email" required>
        <UInput v-model="state.email" type="email" placeholder="you@example.com" class="w-full" autofocus />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" />

      <UButton type="submit" label="Send reset link" block :loading="loading" />
      <ULink to="/sign-in" class="text-sm text-muted block">
        Back to sign in
      </ULink>
    </UForm>
  </UCard>
</template>
