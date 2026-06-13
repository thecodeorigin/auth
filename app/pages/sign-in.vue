<script setup lang="ts">
const route = useRoute()
const email = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)

function resumeTarget(): string {
  if (route.query.client_id) {
    const qs = new URLSearchParams(route.query as Record<string, string>).toString()
    return `/api/auth/oauth2/authorize?${qs}`
  }
  return (route.query.redirect as string) || '/'
}

async function submit() {
  error.value = ''
  loading.value = true
  const client = useAuthClient()
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.signIn.email({
    email: email.value,
    password: password.value,
  })
  loading.value = false
  if (e) {
    error.value = e.message ?? 'Sign-in failed'
    return
  }
  window.location.href = resumeTarget()
}

async function social(provider: 'google' | 'github') {
  error.value = ''
  const client = useAuthClient()
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
  <div style="max-width: 24rem; margin: 6rem auto; font-family: system-ui; display: flex; flex-direction: column; gap: 0.75rem;">
    <h1 style="font-size: 1.25rem; font-weight: 600;">
      Sign in
    </h1>
    <form style="display: flex; flex-direction: column; gap: 0.75rem;" @submit.prevent="submit">
      <input v-model="email" type="email" placeholder="Email" required style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
      <input v-model="password" type="password" placeholder="Password" required style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
      <button :disabled="loading" style="padding: 0.5rem; background: #111; color: #fff; border: none; border-radius: 4px;">
        {{ loading ? 'Signing in…' : 'Continue' }}
      </button>
    </form>
    <div style="display: flex; align-items: center; gap: 0.5rem; color: #999; font-size: 0.8rem;">
      <span style="flex: 1; height: 1px; background: #eee;" /> or <span style="flex: 1; height: 1px; background: #eee;" />
    </div>
    <button style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; background: #fff;" @click="social('google')">
      Continue with Google
    </button>
    <button style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; background: #fff;" @click="social('github')">
      Continue with GitHub
    </button>
    <p v-if="error" style="color: #c00; font-size: 0.875rem;">
      {{ error }}
    </p>
    <p style="font-size: 0.875rem; display: flex; justify-content: space-between;">
      <NuxtLink to="/forgot-password">
        Forgot password?
      </NuxtLink>
      <NuxtLink :to="signUpHref">
        Create account
      </NuxtLink>
    </p>
  </div>
</template>
