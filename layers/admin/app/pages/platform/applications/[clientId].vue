<script setup lang="ts">
import type { ClientDetail } from '~/composables/useApplicationsApi'
import PlatformAppAbilities from '#layers/admin/app/components/Platform/PlatformAppAbilities.vue'
import PlatformClientSecretModal from '#layers/admin/app/components/Platform/PlatformClientSecretModal.vue'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

const route = useRoute()
const api = useApplicationsApi()
const toast = useToast()
const clientId = computed(() => String(route.params.clientId))

const client = ref<ClientDetail | null>(null)
const loading = ref(true)
const notFound = ref(false)

const name = ref('')
const skipConsent = ref(false)
const redirectUris = ref<string[]>([])
const saving = ref(false)

async function load() {
  loading.value = true
  notFound.value = false
  try {
    const data = await api.get(clientId.value)
    client.value = data
    name.value = data.name ?? ''
    skipConsent.value = data.skipConsent
    redirectUris.value = data.redirectUris?.length ? [...data.redirectUris] : ['']
  }
  catch {
    notFound.value = true
  }
  finally {
    loading.value = false
  }
}
onMounted(load)

async function saveOverview() {
  saving.value = true
  try {
    await api.update(clientId.value, { name: name.value, skipConsent: skipConsent.value })
    toast.add({ title: 'Saved', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function toggleDisabled(disabled: boolean) {
  try {
    await api.update(clientId.value, { disabled })
    if (client.value)
      client.value.disabled = disabled
    toast.add({ title: disabled ? 'Application disabled' : 'Application enabled', color: 'success' })
  }
  catch (err) {
    toast.add({ title: 'Update failed', description: (err as Error).message, color: 'error' })
    await load()
  }
}

async function saveUris() {
  const uris = redirectUris.value.map(u => u.trim()).filter(Boolean)
  if (!uris.length) {
    toast.add({ title: 'At least one redirect URI is required', color: 'error' })
    return
  }
  saving.value = true
  try {
    await api.update(clientId.value, { redirectUris: uris })
    toast.add({ title: 'Redirect URIs saved', color: 'success' })
    await load()
  }
  catch (err) {
    toast.add({ title: 'Save failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// Rotate secret
const secretOpen = ref(false)
const rotatedSecret = ref<string | null>(null)
async function rotate() {
  if (!confirm('Rotate the client secret? The current secret stops working immediately.'))
    return
  try {
    const res = await api.rotateSecret(clientId.value)
    rotatedSecret.value = res.clientSecret ?? null
    secretOpen.value = true
  }
  catch (err) {
    toast.add({ title: 'Rotation failed', description: (err as Error).message, color: 'error' })
  }
}

// Delete
const deleteOpen = ref(false)
const confirmName = ref('')
const deleting = ref(false)
const canDelete = computed(() => confirmName.value.trim() === (client.value?.name ?? client.value?.clientId))
async function confirmDelete() {
  if (!canDelete.value)
    return
  deleting.value = true
  try {
    await api.remove(clientId.value)
    toast.add({ title: 'Application deleted', color: 'success' })
    await navigateTo('/platform/applications')
  }
  catch (err) {
    toast.add({ title: 'Delete failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

function copyClientId() {
  navigator.clipboard?.writeText(clientId.value)
  toast.add({ title: 'Client ID copied', color: 'success' })
}
function addUri() {
  redirectUris.value.push('')
}
function removeUri(i: number) {
  redirectUris.value.splice(i, 1)
  if (!redirectUris.value.length)
    redirectUris.value.push('')
}
</script>

<template>
  <UDashboardPanel id="platform-app-detail">
    <template #header>
      <DashboardNavbar :title="client?.name ?? 'Application'">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" variant="ghost" to="/platform/applications" aria-label="Back" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div v-if="loading" class="max-w-3xl">
        <USkeleton class="h-48 w-full" />
      </div>

      <UAlert v-else-if="notFound" color="error" variant="soft" icon="i-lucide-circle-alert" title="Application not found" description="This client may have been deleted." />

      <div v-else-if="client" class="grid gap-6 lg:grid-cols-2 max-w-5xl">
        <!-- Overview -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Overview
            </h2>
          </template>
          <div class="space-y-4">
            <UFormField label="Name">
              <UInput v-model="name" class="w-full" />
            </UFormField>
            <div class="flex gap-2">
              <UFormField label="Type" class="flex-1">
                <UInput :model-value="client.type ?? '—'" disabled class="w-full" />
              </UFormField>
              <UFormField label="Mode" class="flex-1">
                <UBadge :color="client.public ? 'warning' : 'neutral'" variant="subtle">
                  {{ client.public ? 'Public (PKCE)' : 'Confidential' }}
                </UBadge>
              </UFormField>
            </div>
            <UFormField>
              <UCheckbox v-model="skipConsent" label="Skip consent screen" />
            </UFormField>
            <div class="flex justify-end">
              <UButton label="Save" :loading="saving" @click="saveOverview" />
            </div>
          </div>
        </UCard>

        <!-- Credentials -->
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Credentials
            </h2>
          </template>
          <div class="space-y-4">
            <UFormField label="Client ID">
              <div class="flex gap-2">
                <UInput :model-value="client.clientId" readonly class="w-full font-mono text-xs" />
                <UButton icon="i-lucide-copy" variant="subtle" aria-label="Copy client ID" @click="copyClientId" />
              </div>
            </UFormField>
            <div v-if="!client.public">
              <p class="text-sm text-muted mb-2">
                The client secret is never shown after creation. Rotate to generate a new one.
              </p>
              <UButton icon="i-lucide-refresh-cw" color="warning" variant="subtle" label="Rotate secret" @click="rotate" />
            </div>
            <p v-else class="text-sm text-muted">
              Public clients use PKCE and have no secret.
            </p>
          </div>
        </UCard>

        <!-- Redirect URIs -->
        <UCard class="lg:col-span-2">
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Redirect URIs
            </h2>
          </template>
          <div class="space-y-2">
            <div v-for="(_uri, i) in redirectUris" :key="i" class="flex gap-2">
              <UInput v-model="redirectUris[i]" class="w-full" placeholder="https://app.example.com/callback" />
              <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove URI" @click="removeUri(i)" />
            </div>
            <div class="flex justify-between">
              <UButton icon="i-lucide-plus" variant="ghost" size="xs" label="Add URI" @click="addUri" />
              <UButton label="Save URIs" :loading="saving" @click="saveUris" />
            </div>
          </div>
        </UCard>

        <!-- Abilities -->
        <PlatformAppAbilities :client-id="clientId" :abilities="client.abilities" @saved="load" />

        <!-- Danger zone -->
        <UCard class="lg:col-span-2" :ui="{ root: 'ring-error/50' }">
          <template #header>
            <h2 class="font-semibold text-error">
              Danger zone
            </h2>
          </template>
          <div class="space-y-3">
            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium">
                  {{ client.disabled ? 'Disabled' : 'Active' }}
                </p>
                <p class="text-xs text-muted">
                  Disabled applications can't complete OAuth flows.
                </p>
              </div>
              <USwitch :model-value="!client.disabled" @update:model-value="(v: boolean) => toggleDisabled(!v)" />
            </div>
            <USeparator />
            <div class="flex items-center justify-between gap-4">
              <p class="text-sm text-muted">
                Delete this application. Existing tokens and grants will be orphaned.
              </p>
              <UButton color="error" variant="subtle" label="Delete application" @click="deleteOpen = true" />
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <PlatformClientSecretModal v-model:open="secretOpen" :client-id="clientId" :client-secret="rotatedSecret" />

  <UModal v-model:open="deleteOpen" title="Delete application">
    <template #body>
      <div class="space-y-4">
        <UAlert color="error" variant="soft" icon="i-lucide-triangle-alert" title="This is permanent" description="The application and its credentials will be removed." />
        <UFormField :label="`Type ${client?.name ?? client?.clientId} to confirm`">
          <UInput v-model="confirmName" class="w-full" autocomplete="off" />
        </UFormField>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="deleteOpen = false" />
          <UButton color="error" label="Delete" :disabled="!canDelete" :loading="deleting" @click="confirmDelete" />
        </div>
      </div>
    </template>
  </UModal>
</template>
