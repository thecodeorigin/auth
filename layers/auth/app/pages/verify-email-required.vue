<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })

const { user } = useUserSession()
const client = useAuthClient()
const msg = ref('')
const sending = ref(false)

async function resend() {
  msg.value = ''
  sending.value = true
  try {
    if (!client || !user.value?.email)
      return
    const { error } = await client.sendVerificationEmail({ email: user.value.email, callbackURL: '/' })
    msg.value = error ? (error.message ?? 'Could not resend') : 'Verification email sent.'
  }
  finally {
    sending.value = false
  }
}
</script>

<template>
  <UCard>
    <div class="space-y-3 text-center">
      <UIcon name="i-lucide-mail-warning" class="size-10 text-warning mx-auto" />
      <h1 class="text-lg font-semibold text-highlighted">
        Verify your email
      </h1>
      <p class="text-sm text-muted">
        Your account <strong class="text-highlighted">{{ user?.email }}</strong> needs email verification before you can continue.
      </p>
      <UButton label="Resend verification email" icon="i-lucide-mail" block :loading="sending" @click="resend" />
      <p v-if="msg" class="text-sm text-success">
        {{ msg }}
      </p>
    </div>
  </UCard>
</template>
