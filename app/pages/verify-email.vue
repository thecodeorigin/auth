<script setup lang="ts">
const route = useRoute()
const failed = computed(() => !!route.query.error)
const { loggedIn } = useUserSession()
</script>

<template>
  <div style="max-width: 24rem; margin: 6rem auto; font-family: system-ui;">
    <div v-if="failed">
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Verification failed
      </h1>
      <p style="color: #555;">
        This verification link is invalid or has expired.
      </p>
      <p style="margin-top: 1rem;">
        <NuxtLink to="/sign-up">
          Sign up again
        </NuxtLink> or <NuxtLink to="/sign-in">
          sign in
        </NuxtLink> to resend.
      </p>
    </div>
    <div v-else>
      <h1 style="font-size: 1.25rem; font-weight: 600;">
        Email verified
      </h1>
      <p style="color: #555;">
        Your email is confirmed{{ loggedIn ? " and you're signed in." : '.' }}
      </p>
      <p style="margin-top: 1rem;">
        <NuxtLink to="/">
          Continue
        </NuxtLink>
      </p>
    </div>
  </div>
</template>
