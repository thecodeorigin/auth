<script setup lang="ts">
// TODO(auth-hub phase 4.4, deferred): fetch the client's registered name via
// GET /api/auth/oauth2/clients/:id and show it + human-readable scope descriptions
// instead of the raw client_id.
const route = useRoute()
const error = ref('')
const submitting = ref(false)

async function decide(accept: boolean) {
  error.value = ''
  submitting.value = true
  try {
    const oauthQuery = globalThis.location.search.replace(/^\?/, '')
    const result = await $fetch<{ redirectURI?: string, url?: string }>('/api/auth/oauth2/consent', {
      method: 'POST',
      body: { accept, oauth_query: oauthQuery },
    })
    const target = result.redirectURI ?? result.url
    if (target)
      globalThis.location.href = target
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Consent failed'
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <div style="max-width: 24rem; margin: 6rem auto; font-family: system-ui;">
    <h1 style="font-size: 1.25rem; font-weight: 600;">
      Authorize {{ route.query.client_id }}
    </h1>
    <p style="color: #555; font-size: 0.875rem;">
      Scopes: {{ route.query.scope }}
    </p>
    <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
      <button :disabled="submitting" style="flex: 1; padding: 0.5rem; background: #111; color: #fff; border: none; border-radius: 4px;" @click="decide(true)">
        Allow
      </button>
      <button :disabled="submitting" style="flex: 1; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; background: #fff;" @click="decide(false)">
        Deny
      </button>
    </div>
    <p v-if="error" style="color: #c00; font-size: 0.875rem; margin-top: 0.5rem;">
      {{ error }}
    </p>
  </div>
</template>
