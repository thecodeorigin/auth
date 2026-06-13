<script setup lang="ts">
const route = useRoute()
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : undefined))
const invalid = computed(() => route.query.error === 'INVALID_TOKEN' || !token.value)
const password = ref('')
const error = ref('')
const loading = ref(false)
const done = ref(false)

async function submit() {
  error.value = ''
  const resetToken = token.value
  if (!resetToken) {
    error.value = 'Missing or invalid reset token.'
    return
  }
  loading.value = true
  const client = useAuthClient()
  if (!client) {
    loading.value = false
    return
  }
  const { error: e } = await client.resetPassword({ newPassword: password.value, token: resetToken })
  loading.value = false
  if (e) {
    error.value = e.message ?? 'Could not reset password'
    return
  }
  done.value = true
}
</script>

<template>
  <div style="max-width: 24rem; margin: 6rem auto; font-family: system-ui;">
    <div v-if="done">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Password updated
      </h1>
      <p style="color: #555;">
        Your password was changed and other sessions were signed out.
      </p>
      <p style="margin-top: 1rem;">
        <NuxtLink to="/sign-in">
          Sign in
        </NuxtLink>
      </p>
    </div>
    <div v-else-if="invalid">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Link expired
      </h1>
      <p style="color: #555;">
        This reset link is invalid or has expired.
      </p>
      <p style="margin-top: 1rem;">
        <NuxtLink to="/forgot-password">
          Request a new link
        </NuxtLink>
      </p>
    </div>
    <form v-else style="display: flex; flex-direction: column; gap: 0.75rem;" @submit.prevent="submit">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Choose a new password
      </h1>
      <input v-model="password" type="password" placeholder="New password (min 8 chars)" required minlength="8" style="padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px;">
      <button :disabled="loading" style="padding: 0.5rem; background: #111; color: #fff; border: none; border-radius: 4px;">
        {{ loading ? 'Saving…' : 'Set new password' }}
      </button>
      <p v-if="error" style="color: #c00; font-size: 0.875rem;">
        {{ error }}
      </p>
    </form>
  </div>
</template>
