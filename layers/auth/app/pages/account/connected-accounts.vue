<script setup lang="ts">
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface LinkedAccount {
  id: string
  providerId: string
  accountId: string
}

const PROVIDERS = [
  { id: 'google', label: 'Google', icon: 'i-simple-icons-google' },
  { id: 'github', label: 'GitHub', icon: 'i-simple-icons-github' },
] as const

const account = useAccountApi()
const appsApi = useApplicationsApi()
const toast = useToast()

const accounts = ref<LinkedAccount[]>([])
const configured = ref<Record<string, boolean>>({})
const loading = ref(true)
const busy = ref('')

// Only providers the IdP actually has credentials for can be linked; the rest
// are shown disabled with a hint (fixes the "Failed to start linking" error).
const availableProviders = computed(() => PROVIDERS.filter(p => configured.value[p.id]))
const noneConfigured = computed(() => availableProviders.value.length === 0)

async function load() {
  loading.value = true
  try {
    const [{ data }, status] = await Promise.all([
      account.listAccounts(),
      appsApi.providers().catch(() => ({ providers: [] as { id: string, configured: boolean }[] })),
    ])
    accounts.value = (data ?? []) as LinkedAccount[]
    configured.value = Object.fromEntries(status.providers.map(p => [p.id, p.configured]))
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

function linkedFor(providerId: string) {
  return accounts.value.find(a => a.providerId === providerId)
}

function unlinkProvider(providerId: string) {
  const acc = linkedFor(providerId)
  if (acc)
    unlink(acc)
}

// Number of login methods (social links + credential).
const loginMethodCount = computed(() => accounts.value.length)

async function connect(providerId: string) {
  busy.value = providerId
  try {
    const { data, error } = await account.linkSocial({ provider: providerId, callbackURL: '/account/connected-accounts' })
    if (error)
      throw new Error(error.message ?? 'Failed to start linking')
    const url = (data as { url?: string } | null)?.url
    if (url)
      window.location.href = url
  }
  catch (err) {
    toast.add({ title: 'Connect failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    busy.value = ''
  }
}

async function unlink(acc: LinkedAccount) {
  busy.value = acc.providerId
  try {
    const { error } = await account.unlinkAccount({ providerId: acc.providerId, accountId: acc.accountId })
    if (error)
      throw new Error(error.message ?? 'Failed to unlink')
    toast.add({ title: 'Account disconnected', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Unlink failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    busy.value = ''
  }
}
</script>

<template>
  <UDashboardPanel id="account-connected">
    <template #header>
      <DashboardNavbar title="Connected Accounts" />
    </template>

    <template #body>
      <div class="max-w-2xl">
        <UCard>
          <div v-if="loading" class="space-y-3">
            <USkeleton class="h-12 w-full" />
            <USkeleton class="h-12 w-full" />
          </div>
          <div v-else-if="noneConfigured" class="text-center text-muted py-6 text-sm">
            No social sign-in providers are configured. Ask an administrator to set them up.
          </div>
          <div v-else class="divide-y divide-default">
            <div
              v-for="provider in availableProviders"
              :key="provider.id"
              class="flex items-center justify-between gap-4 py-3"
            >
              <div class="flex items-center gap-3">
                <UIcon :name="provider.icon" class="size-5" />
                <div>
                  <p class="font-medium">
                    {{ provider.label }}
                  </p>
                  <p v-if="linkedFor(provider.id)" class="text-xs text-muted">
                    Connected
                  </p>
                </div>
              </div>
              <template v-if="linkedFor(provider.id)">
                <UTooltip :text="loginMethodCount <= 1 ? 'You can\'t disconnect your only login method' : ''" :disabled="loginMethodCount > 1">
                  <UButton
                    color="error"
                    variant="subtle"
                    label="Disconnect"
                    :loading="busy === provider.id"
                    :disabled="loginMethodCount <= 1"
                    @click="unlinkProvider(provider.id)"
                  />
                </UTooltip>
              </template>
              <UButton
                v-else
                variant="subtle"
                label="Connect"
                :loading="busy === provider.id"
                @click="connect(provider.id)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
