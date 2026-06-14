<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

// Any authenticated user (developer-facing). No sysadmin middleware.
const toast = useToast()
const config = useRuntimeConfig()

const origin = computed(() => {
  const site = (config.public as { siteUrl?: string }).siteUrl
  if (site)
    return site.replace(/\/$/, '')
  return import.meta.client ? window.location.origin : ''
})

const base = computed(() => `${origin.value}/api/auth`)

const endpoints = computed(() => [
  { label: 'Issuer', url: origin.value },
  { label: 'Discovery', url: `${base.value}/.well-known/openid-configuration` },
  { label: 'JWKS', url: `${base.value}/jwks` },
  { label: 'Authorize', url: `${base.value}/oauth2/authorize` },
  { label: 'Token', url: `${base.value}/oauth2/token` },
  { label: 'UserInfo', url: `${base.value}/oauth2/userinfo` },
  { label: 'End Session', url: `${base.value}/oauth2/end-session` },
  { label: 'Introspect', url: `${base.value}/oauth2/introspect` },
  { label: 'Dynamic Registration', url: `${base.value}/oauth2/register` },
])

function copy(url: string) {
  navigator.clipboard?.writeText(url)
  toast.add({ title: 'Copied', color: 'success' })
}

// Live discovery
const discovery = ref<Record<string, unknown> | null>(null)
const discoveryError = ref('')
onMounted(async () => {
  try {
    discovery.value = await $fetch(`${base.value}/.well-known/openid-configuration`)
  }
  catch (err) {
    discoveryError.value = (err as Error).message ?? 'Discovery document unavailable'
  }
})

// Introspection tester — secret is never persisted.
const introToken = ref('')
const introClientId = ref('')
const introSecret = ref('')
const introResult = ref<string>('')
const introspecting = ref(false)

async function introspect() {
  introspecting.value = true
  introResult.value = ''
  try {
    const basic = btoa(`${introClientId.value}:${introSecret.value}`)
    const res = await $fetch(`${base.value}/oauth2/introspect`, {
      method: 'POST',
      headers: { 'Authorization': `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: introToken.value }).toString(),
    })
    introResult.value = JSON.stringify(res, null, 2)
  }
  catch (err) {
    const e = err as { data?: unknown, message?: string }
    introResult.value = JSON.stringify(e.data ?? { error: e.message }, null, 2)
  }
  finally {
    introspecting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="platform-idp">
    <template #header>
      <DashboardNavbar title="IdP Reference" />
    </template>

    <template #body>
      <div class="space-y-6 max-w-4xl">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              OIDC endpoints
            </h2>
          </template>
          <div class="divide-y divide-default">
            <div v-for="ep in endpoints" :key="ep.label" class="flex items-center justify-between gap-4 py-2.5">
              <div class="min-w-0">
                <p class="text-sm font-medium">
                  {{ ep.label }}
                </p>
                <p class="text-xs text-muted font-mono truncate">
                  {{ ep.url }}
                </p>
              </div>
              <UButton icon="i-lucide-copy" variant="ghost" size="xs" aria-label="Copy URL" @click="copy(ep.url)" />
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Discovery document
            </h2>
          </template>
          <UAlert v-if="discoveryError" color="warning" variant="soft" :title="discoveryError" icon="i-lucide-info" />
          <pre v-else-if="discovery" class="text-xs overflow-auto max-h-72 bg-muted rounded p-3">{{ JSON.stringify(discovery, null, 2) }}</pre>
          <div v-else class="text-sm text-muted">
            Loading…
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Token introspection tester
            </h2>
          </template>
          <div class="space-y-3">
            <UFormField label="Access token">
              <UInput v-model="introToken" class="w-full font-mono text-xs" placeholder="eyJ…" />
            </UFormField>
            <div class="flex gap-3">
              <UFormField label="Client ID" class="flex-1">
                <UInput v-model="introClientId" class="w-full font-mono text-xs" />
              </UFormField>
              <UFormField label="Client secret" class="flex-1" help="Never stored.">
                <UInput v-model="introSecret" type="password" class="w-full font-mono text-xs" />
              </UFormField>
            </div>
            <div class="flex justify-end">
              <UButton label="Introspect" :loading="introspecting" :disabled="!introToken || !introClientId" @click="introspect" />
            </div>
            <pre v-if="introResult" class="text-xs overflow-auto max-h-60 bg-muted rounded p-3">{{ introResult }}</pre>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
