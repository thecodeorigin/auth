<script setup lang="ts">
const { loggedIn, user, login, logout } = useOidcAuth()
</script>

<template>
  <main style="max-width: 32rem; margin: 4rem auto; font-family: system-ui;">
    <h1 style="font-size: 1.25rem;">
      Nuxt RP — OIDC client
    </h1>
    <button v-if="!loggedIn" style="padding: 0.5rem 0.75rem;" @click="login('oidc')">
      Sign in with auth.example.com
    </button>
    <template v-else>
      <pre style="background: #f6f6f6; padding: 1rem; border-radius: 6px;">{{ user.userInfo }}</pre>
      <button style="padding: 0.5rem 0.75rem;" @click="logout('oidc')">
        Sign out
      </button>
    </template>
  </main>
</template>
