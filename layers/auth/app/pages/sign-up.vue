<script setup lang="ts">
import * as z from 'zod'

definePageMeta({ layout: 'auth', public: true })

const route = useRoute()
const client = useAuthClient()
const error = ref('')
const loading = ref(false)
const sent = ref(false)
const resendMsg = ref('')

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters'),
})
type Schema = z.output<typeof schema>
const state = reactive({ name: '', email: '', password: '' })

async function onSubmit(event: { data: Schema }) {
  error.value = ''
  loading.value = true
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.signUp.email({ name: event.data.name, email: event.data.email, password: event.data.password })
  loading.value = false
  if (e) {
    error.value = e.message ?? 'Sign-up failed'
    return
  }
  sent.value = true
}

async function resend() {
  resendMsg.value = ''
  if (!client)
    return
  const { error: e } = await client.sendVerificationEmail({ email: state.email, callbackURL: '/' })
  resendMsg.value = e ? (e.message ?? 'Could not resend') : 'Verification email re-sent.'
}

const signInHref = computed(() => {
  const q = new URLSearchParams(route.query as Record<string, string>).toString()
  return q ? `/sign-in?${q}` : '/sign-in'
})
</script>

<template>
  <UCard>
    <template v-if="sent" #header>
      <h1 class="text-lg font-semibold text-highlighted">
        Check your email
      </h1>
    </template>
    <template v-else #header>
      <h1 class="text-lg font-semibold text-highlighted">
        Create your account
      </h1>
    </template>

    <div v-if="sent" class="space-y-3">
      <p class="text-sm text-muted">
        We sent a verification link to <strong class="text-highlighted">{{ state.email }}</strong>.
      </p>
      <UButton color="neutral" variant="subtle" label="Resend email" icon="i-lucide-mail" @click="resend" />
      <p v-if="resendMsg" class="text-sm text-success">
        {{ resendMsg }}
      </p>
      <ULink :to="signInHref" class="text-sm text-primary block">
        Back to sign in
      </ULink>
    </div>

    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Name" name="name" required>
        <UInput v-model="state.name" placeholder="Jane Doe" class="w-full" autofocus />
      </UFormField>
      <UFormField label="Email" name="email" required>
        <UInput v-model="state.email" type="email" placeholder="you@example.com" class="w-full" />
      </UFormField>
      <UFormField label="Password" name="password" required help="Minimum 8 characters">
        <UInput v-model="state.password" type="password" placeholder="••••••••" class="w-full" />
      </UFormField>

      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" />

      <UButton type="submit" label="Sign up" block :loading="loading" />
      <p class="text-sm text-muted">
        Already have an account?
        <ULink :to="signInHref" class="text-primary">
          Sign in
        </ULink>
      </p>
    </UForm>
  </UCard>
</template>
