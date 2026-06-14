<script setup lang="ts">
definePageMeta({ layout: 'auth', public: true })

const route = useRoute()
const { user } = useUserSession()
const appsApi = useApplicationsApi()
const error = ref('')
const submitting = ref<false | 'accept' | 'deny'>(false)

const clientId = computed(() => String(route.query.client_id ?? ''))

// Resolve the app's display name from the (non-secret) catalog.
const appName = ref('')
onMounted(async () => {
  try {
    const catalog = await appsApi.list()
    appName.value = catalog.find(c => c.clientId === clientId.value)?.name ?? clientId.value
  }
  catch {
    appName.value = clientId.value
  }
})

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Verify your identity',
  profile: 'Access your basic profile (name, picture)',
  email: 'Access your email address',
  offline_access: 'Maintain access when you are offline',
  org: 'Access your organization and roles',
  roles: 'Access your roles',
}

const scopes = computed(() => String(route.query.scope ?? '').split(/[\s+]+/).filter(Boolean))

function scopeLabel(scope: string): { text: string, known: boolean } {
  return SCOPE_LABELS[scope]
    ? { text: SCOPE_LABELS[scope], known: true }
    : { text: scope, known: false }
}

async function decide(accept: boolean) {
  error.value = ''
  submitting.value = accept ? 'accept' : 'deny'
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
  <UCard :ui="{ root: 'max-w-[480px] mx-auto' }">
    <template #header>
      <div class="text-center space-y-2">
        <UIcon name="i-lucide-shield-check" class="size-9 text-primary mx-auto" />
        <h1 class="text-lg font-semibold text-highlighted">
          Authorize {{ appName || clientId }}
        </h1>
        <p class="text-sm text-muted">
          Signing in as <strong class="text-highlighted">{{ user?.email }}</strong>
        </p>
      </div>
    </template>

    <div class="space-y-4">
      <p class="text-sm text-muted">
        This application is requesting permission to:
      </p>
      <ul class="space-y-2">
        <li v-for="scope in scopes" :key="scope" class="flex items-start gap-2 text-sm">
          <UIcon name="i-lucide-check" class="size-4 text-success mt-0.5 shrink-0" />
          <span :class="{ 'italic text-muted': !scopeLabel(scope).known }">{{ scopeLabel(scope).text }}</span>
        </li>
      </ul>

      <UAlert v-if="error" color="error" variant="soft" :title="error" icon="i-lucide-circle-alert" />
    </div>

    <template #footer>
      <div class="flex gap-2">
        <UButton
          color="neutral"
          variant="subtle"
          block
          label="Deny"
          :loading="submitting === 'deny'"
          :disabled="!!submitting"
          @click="decide(false)"
        />
        <UButton
          block
          label="Allow"
          :loading="submitting === 'accept'"
          :disabled="!!submitting"
          @click="decide(true)"
        />
      </div>
    </template>
  </UCard>
</template>
