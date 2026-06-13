<script setup lang="ts">
const { loggedIn, user, signOut } = useUserSession()
</script>

<template>
  <main style="max-width: 28rem; margin: 6rem auto; font-family: system-ui; line-height: 1.5;">
    <h1 style="font-size: 1.25rem; font-weight: 600;">
      auth.thecodeorigin.com
    </h1>
    <p style="color: #555;">
      OIDC Identity Provider
    </p>
    <div v-if="loggedIn" style="margin-top: 1rem;">
      <p>Signed in as <strong>{{ user?.email }}</strong></p>
      <p style="margin-top: 0.5rem;">
        <NuxtLink to="/orgs">
          My organizations
        </NuxtLink>
      </p>
      <button style="margin-top: 0.5rem; padding: 0.5rem 0.75rem;" @click="signOut()">
        Sign out
      </button>
    </div>
    <div v-else style="margin-top: 1rem;">
      <NuxtLink to="/sign-in">
        Sign in
      </NuxtLink>
    </div>
  </main>
</template>
