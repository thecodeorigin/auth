<script setup lang="ts">
const email = ref('')
const error = ref('')
const loading = ref(false)
const sent = ref(false)

async function submit() {
  error.value = ''
  loading.value = true
  const client = useAuthClient()
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.requestPasswordReset({
    email: email.value,
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
  <div style="max-width: 24rem; margin: 6rem auto; font-family: system-ui;">
    <div v-if="sent">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Check your email
      </h1>
      <p style="color: #555;">
        If an account exists for <strong>{{ email }}</strong>, a reset link is on its way.
      </p>
      <p style="margin-top: 1rem;">
        <NuxtLink to="/sign-in">
          Back to sign in
        </NuxtLink>
      </p>
    </div>
    <form v-else style="display: flex; flex-direction: column; gap: 0.75rem;" @submit.prevent="submit">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Reset your password
      </h1>
      <input v-model="email" type="email" placeholder="Email" required style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
      <button :disabled="loading" style="padding: 0.5rem; background: #111; color: #fff; border: none; border-radius: 4px;">
        {{ loading ? 'Sending…' : 'Send reset link' }}
      </button>
      <p v-if="error" style="color: #c00; font-size: 0.875rem;">
        {{ error }}
      </p>
      <p style="font-size: 0.875rem;">
        <NuxtLink to="/sign-in">
          Back to sign in
        </NuxtLink>
      </p>
    </form>
  </div>
</template>
