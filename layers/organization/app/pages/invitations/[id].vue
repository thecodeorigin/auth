<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })

interface Invitation {
  id: string
  organizationName?: string | null
  role: string
  status: string
  email?: string
  expiresAt?: string | Date
}

const route = useRoute()
const orgApi = useOrgApi()
const { loggedIn, user, fetchSession } = useUserSession()
const toast = useToast()
const id = computed(() => String(route.params.id))

const { data: invitation, pending, error } = await useAsyncData(
  () => `invitation-${id.value}`,
  async () => {
    const { data, error: e } = await orgApi.getInvitation(id.value)
    if (e)
      throw new Error(e.message ?? 'Invitation not found')
    return data as Invitation
  },
  { server: false },
)

const busy = ref(false)
const wrongAccount = computed(() =>
  loggedIn.value && invitation.value?.email && user.value?.email
  && invitation.value.email.toLowerCase() !== user.value.email.toLowerCase())

async function respond(accept: boolean) {
  busy.value = true
  try {
    const { error: e } = accept ? await orgApi.acceptInvitation(id.value) : await orgApi.rejectInvitation(id.value)
    if (e)
      throw new Error(e.message ?? 'Failed to respond')
    if (accept)
      await fetchSession({ force: true })
    toast.add({ title: accept ? 'Invitation accepted' : 'Invitation declined', color: 'success' })
    await navigateTo(accept ? '/' : '/invitations')
  }
  catch (err) {
    toast.add({ title: 'Action failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    busy.value = false
  }
}

const signInHref = computed(() => `/sign-in?redirect=${encodeURIComponent(`/invitations/${id.value}`)}`)
</script>

<template>
  <UCard>
    <div v-if="pending" class="space-y-3">
      <USkeleton class="h-6 w-2/3" />
      <USkeleton class="h-4 w-full" />
    </div>

    <div v-else-if="error" class="space-y-3 text-center">
      <UIcon name="i-lucide-mail-x" class="size-10 text-error mx-auto" />
      <h1 class="text-lg font-semibold text-highlighted">
        Invitation unavailable
      </h1>
      <p class="text-sm text-muted">
        This invitation is invalid, expired, or already used.
      </p>
      <ULink to="/" class="text-sm text-primary">
        Go home
      </ULink>
    </div>

    <div v-else class="space-y-4">
      <div class="text-center space-y-1">
        <UIcon name="i-lucide-mail-plus" class="size-10 text-primary mx-auto" />
        <h1 class="text-lg font-semibold text-highlighted">
          You're invited
        </h1>
        <p class="text-sm text-muted">
          Join <strong class="text-highlighted">{{ invitation?.organizationName ?? 'an organization' }}</strong>
          as <strong class="capitalize">{{ invitation?.role }}</strong>.
        </p>
      </div>

      <UAlert
        v-if="wrongAccount"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Different account"
        :description="`This invite was sent to ${invitation?.email}, but you're signed in as ${user?.email}.`"
      />

      <div v-if="loggedIn" class="flex gap-2">
        <UButton color="neutral" variant="subtle" block label="Decline" :loading="busy" @click="respond(false)" />
        <UButton block label="Accept" :loading="busy" @click="respond(true)" />
      </div>
      <UButton v-else block label="Log in to respond" :to="signInHref" />
    </div>
  </UCard>
</template>
