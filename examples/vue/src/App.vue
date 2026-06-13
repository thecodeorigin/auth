<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { handleCallback, login } from './auth'

const user = ref<Record<string, unknown> | null>(null)
const error = ref('')

onMounted(async () => {
  if (location.pathname === '/callback') {
    try {
      user.value = await handleCallback()
      history.replaceState({}, '', '/') // clean the code/state out of the URL
    }
    catch (e) {
      error.value = (e as Error).message
    }
  }
})
</script>

<template>
  <main style="max-width: 32rem; margin: 4rem auto; font-family: system-ui;">
    <h1 style="font-size: 1.25rem;">
      Vue SPA — public OIDC client
    </h1>
    <pre v-if="user" style="background: #f6f6f6; padding: 1rem; border-radius: 6px;">{{ JSON.stringify(user, null, 2) }}</pre>
    <button v-else style="padding: 0.5rem 0.75rem;" @click="login">
      Sign in with auth.example.com
    </button>
    <p v-if="error" style="color: #c00;">
      {{ error }}
    </p>
  </main>
</template>
