<script setup lang="ts">
const route = useRoute()
const name = ref('')
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const sent = ref(false)
const resendMsg = ref('')

async function submit() {
  error.value = ''
  loading.value = true
  const client = useAuthClient()
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.signUp.email({
    name: name.value,
    email: email.value,
    password: password.value,
  })
  loading.value = false
  if (e) {
    error.value = e.message ?? 'Sign-up failed'
    return
  }
  sent.value = true
}

async function resend() {
  resendMsg.value = ''
  const client = useAuthClient()
  if (!client)
    return
  const { error: e } = await client.sendVerificationEmail({ email: email.value, callbackURL: '/' })
  resendMsg.value = e ? (e.message ?? 'Could not resend') : 'Verification email re-sent.'
}

const signInHref = computed(() => {
  const q = new URLSearchParams(route.query as Record<string, string>).toString()
  return q ? `/sign-in?${q}` : '/sign-in'
})
</script>

<template>
  <div style="max-width: 24rem; margin: 6rem auto; font-family: system-ui;">
    <div v-if="sent">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Check your email
      </h1>
      <p style="color: #555;">
        We sent a verification link to <strong>{{ email }}</strong>.
      </p>
      <button style="margin-top: 0.5rem; padding: 0.5rem 0.75rem;" @click="resend">
        Resend email
      </button>
      <p v-if="resendMsg" style="color: #060; font-size: 0.875rem;">
        {{ resendMsg }}
      </p>
      <p style="margin-top: 1rem;">
        <NuxtLink :to="signInHref">
          Back to sign in
        </NuxtLink>
      </p>
    </div>
    <form v-else style="display: flex; flex-direction: column; gap: 0.75rem;" @submit.prevent="submit">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Create your account
      </h1>
      <input v-model="name" type="text" placeholder="Name" required style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
      <input v-model="email" type="email" placeholder="Email" required style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
      <input v-model="password" type="password" placeholder="Password (min 8 chars)" required minlength="8" style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
      <button :disabled="loading" style="padding: 0.5rem; background: #111; color: #fff; border: none; border-radius: 4px;">
        {{ loading ? 'Creating…' : 'Sign up' }}
      </button>
      <p v-if="error" style="color: #c00; font-size: 0.875rem;">
        {{ error }}
      </p>
      <p style="font-size: 0.875rem;">
        Already have an account? <NuxtLink :to="signInHref">
          Sign in
        </NuxtLink>
      </p>
    </form>
  </div>
</template>
