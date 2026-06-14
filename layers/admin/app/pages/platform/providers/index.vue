<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

interface ProviderForm {
  id: string
  label: string
  icon: string
  envPrefix: string
  clientId: string
  clientSecret: string
}

const appsApi = useApplicationsApi()
const toast = useToast()

const configured = ref<Record<string, boolean>>({})

const providers = reactive<ProviderForm[]>([
  { id: 'google', label: 'Google', icon: 'i-simple-icons-google', envPrefix: 'NUXT_GOOGLE', clientId: '', clientSecret: '' },
  { id: 'github', label: 'GitHub', icon: 'i-simple-icons-github', envPrefix: 'NUXT_GITHUB', clientId: '', clientSecret: '' },
])

onMounted(async () => {
  const status = await appsApi.providers().catch(() => ({ providers: [] }))
  configured.value = Object.fromEntries(status.providers.map(p => [p.id, p.configured]))
})

function envBlock(p: ProviderForm): string {
  return `${p.envPrefix}_CLIENT_ID=${p.clientId || '<client-id>'}\n${p.envPrefix}_CLIENT_SECRET=${p.clientSecret || '<client-secret>'}`
}

async function copyEnv(p: ProviderForm) {
  try {
    await navigator.clipboard.writeText(envBlock(p))
    toast.add({ title: `${p.label} env vars copied`, description: 'Paste into your .env / deployment secrets, then restart.', color: 'success' })
  }
  catch {
    toast.add({ title: 'Copy failed', description: 'Select and copy the block manually.', color: 'error' })
  }
}
</script>

<template>
  <UDashboardPanel id="platform-providers">
    <template #header>
      <DashboardNavbar title="Providers" />
    </template>

    <template #body>
      <div class="max-w-2xl space-y-6">
        <UAlert
          color="info"
          variant="subtle"
          icon="i-lucide-info"
          title="How provider credentials are applied"
          description="Social sign-in credentials are read from environment variables at server start. Enter your credentials below to generate the exact env vars, paste them into your deployment, and restart to activate 'Sign in with …'."
        />

        <UCard v-for="p in providers" :key="p.id">
          <template #header>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <UIcon :name="p.icon" class="size-5" />
                <h2 class="font-semibold text-highlighted">
                  {{ p.label }}
                </h2>
              </div>
              <UBadge :color="configured[p.id] ? 'success' : 'neutral'" variant="subtle">
                {{ configured[p.id] ? 'Live' : 'Not configured' }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <UFormField label="Client ID">
              <UInput v-model="p.clientId" class="w-full font-mono text-xs" placeholder="…apps.googleusercontent.com" />
            </UFormField>
            <UFormField label="Client Secret">
              <UInput v-model="p.clientSecret" type="password" class="w-full font-mono text-xs" />
            </UFormField>

            <div>
              <p class="text-sm font-medium mb-1">
                Environment variables
              </p>
              <pre class="text-xs bg-muted rounded p-3 overflow-auto">{{ envBlock(p) }}</pre>
              <div class="flex justify-end mt-2">
                <UButton icon="i-lucide-copy" variant="subtle" label="Copy env vars" @click="copyEnv(p)" />
              </div>
            </div>
          </div>
        </UCard>

        <p class="text-xs text-muted">
          Additional providers (e.g. Facebook) require registering the provider in the
          server auth config before their env vars take effect.
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
