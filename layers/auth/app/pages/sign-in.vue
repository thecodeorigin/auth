<script setup lang="ts">
import * as z from 'zod'

definePageMeta({ layout: 'auth', public: true })

const route = useRoute()
const client = useAuthClient()
const error = ref('')
const loading = ref(false)

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
})
type Schema = z.output<typeof schema>
const state = reactive({ email: '', password: '' })

function resumeTarget(): string {
  if (route.query.client_id) {
    const qs = new URLSearchParams(route.query as Record<string, string>).toString()
    return `/api/auth/oauth2/authorize?${qs}`
  }
  return (route.query.redirect as string) || '/'
}

async function onSubmit(event: { data: Schema }) {
  error.value = ''
  loading.value = true
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.signIn.email({ email: event.data.email, password: event.data.password })
  loading.value = false
  if (e) {
    error.value = e.message ?? 'Sign-in failed'
    return
  }
  window.location.href = resumeTarget()
}

async function social(provider: 'google' | 'github') {
  error.value = ''
  if (!client)
    return
  const { error: e } = await client.signIn.social({ provider, callbackURL: resumeTarget() })
  if (e)
    error.value = e.message ?? `Could not start ${provider} sign-in`
}

const signUpHref = computed(() => {
  const q = new URLSearchParams(route.query as Record<string, string>).toString()
  return q ? `/sign-up?${q}` : '/sign-up'
})
</script>

<template>
  <UCard>
    <template #header>
      <h1 class="text-lg font-semibold text-highlighted">
        Sign in
      </h1>
      <p class="text-sm text-muted">
        Welcome back. Continue to your account.
      </p>
    </template>

    <UAlert
      v-if="route.query.reason === 'session_expired'"
      color="warning"
      variant="soft"
      icon="i-lucide-clock-alert"
      title="Your session expired"
      description="Please sign in again to continue."
      class="mb-4"
    />

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email" required>
        <UInput v-model="state.email" type="email" placeholder="you@example.com" class="w-full" autofocus />
      </UFormField>
      <UFormField label="Password" name="password" required>
        <UInput v-model="state.password" type="password" placeholder="••••••••" class="w-full" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" />

      <UButton type="submit" label="Continue" block :loading="loading" />
    </UForm>

    <USeparator label="or" class="my-4" />

    <div class="space-y-2">
      <UButton block color="neutral" variant="subtle" icon="i-simple-icons-google" label="Continue with Google" @click="social('google')" />
      <UButton block color="neutral" variant="subtle" icon="i-simple-icons-github" label="Continue with GitHub" @click="social('github')" />
    </div>

    <template #footer>
      <div class="flex justify-between text-sm">
        <ULink to="/forgot-password" class="text-muted">
          Forgot password?
        </ULink>
        <ULink :to="signUpHref" class="text-primary">
          Create account
        </ULink>
      </div>
    </template>
  </UCard>
</template>
