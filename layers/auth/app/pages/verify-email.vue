<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })

const route = useRoute()
const failed = computed(() => !!route.query.error)
const { loggedIn } = useUserSession()
</script>

<template>
  <UCard>
    <div v-if="failed" class="space-y-3 text-center">
      <UIcon name="i-lucide-circle-x" class="size-10 text-error mx-auto" />
      <h1 class="text-lg font-semibold text-highlighted">
        Verification failed
      </h1>
      <p class="text-sm text-muted">
        This verification link is invalid or has expired.
      </p>
      <div class="flex justify-center gap-3 text-sm">
        <ULink to="/sign-up" class="text-primary">
          Sign up again
        </ULink>
        <ULink to="/sign-in" class="text-primary">
          Sign in to resend
        </ULink>
      </div>
    </div>

    <div v-else class="space-y-3 text-center">
      <UIcon name="i-lucide-circle-check" class="size-10 text-success mx-auto" />
      <h1 class="text-lg font-semibold text-highlighted">
        Email verified
      </h1>
      <p class="text-sm text-muted">
        Your email is confirmed{{ loggedIn ? " and you're signed in." : '.' }}
      </p>
      <UButton to="/" label="Continue" block />
    </div>
  </UCard>
</template>
