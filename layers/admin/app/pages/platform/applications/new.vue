<script setup lang="ts">
import type { ClientCreateInput } from '~/composables/useApplicationsApi'
import PlatformClientSecretModal from '#layers/admin/app/components/Platform/PlatformClientSecretModal.vue'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

definePageMeta({ middleware: 'sysadmin' })

const api = useApplicationsApi()
const toast = useToast()

const name = ref('')
const type = ref<'web' | 'native' | 'user-agent-based'>('web')
const isPublic = ref(false)
const skipConsent = ref(false)
const redirectUris = ref<string[]>([''])
const submitting = ref(false)
const errors = ref<string[]>([])

const typeItems = [
  { label: 'Web (confidential)', value: 'web' },
  { label: 'Native', value: 'native' },
  { label: 'User-agent-based (SPA)', value: 'user-agent-based' },
]

function addUri() {
  redirectUris.value.push('')
}
function removeUri(i: number) {
  redirectUris.value.splice(i, 1)
  if (!redirectUris.value.length)
    redirectUris.value.push('')
}

function validate(): string[] {
  const errs: string[] = []
  if (!name.value.trim())
    errs.push('Name is required.')
  const uris = redirectUris.value.map(u => u.trim()).filter(Boolean)
  if (!uris.length)
    errs.push('At least one redirect URI is required.')
  for (const u of uris) {
    try {
      const parsed = new URL(u)
      if (parsed.hash)
        errs.push(`Redirect URI must not contain a fragment (#): ${u}`)
    }
    catch {
      errs.push(`Invalid absolute URL: ${u}`)
    }
  }
  return errs
}

const secretOpen = ref(false)
const createdClientId = ref<string | null>(null)
const createdSecret = ref<string | null>(null)

async function submit() {
  errors.value = validate()
  if (errors.value.length)
    return
  submitting.value = true
  try {
    const body: ClientCreateInput = {
      name: name.value.trim(),
      redirectUris: redirectUris.value.map(u => u.trim()).filter(Boolean),
      type: type.value,
      public: isPublic.value,
      skipConsent: skipConsent.value,
    }
    const result = await api.create(body) as { clientId: string, clientSecret: string | null }
    toast.add({ title: 'Application created', color: 'success' })
    if (result.clientSecret) {
      createdClientId.value = result.clientId
      createdSecret.value = result.clientSecret
      secretOpen.value = true
    }
    else {
      await navigateTo(`/platform/applications/${result.clientId}`)
    }
  }
  catch (err) {
    const e = err as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Create failed', description: e.data?.statusMessage ?? e.message ?? 'Unknown error', color: 'error' })
  }
  finally {
    submitting.value = false
  }
}

function onSecretAck() {
  if (createdClientId.value)
    navigateTo(`/platform/applications/${createdClientId.value}`)
}
</script>

<template>
  <UDashboardPanel id="platform-app-new">
    <template #header>
      <DashboardNavbar title="Create Application">
        <template #leading>
          <UButton icon="i-lucide-arrow-left" variant="ghost" to="/platform/applications" aria-label="Back" />
        </template>
      </DashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-xl space-y-4">
        <UAlert v-if="errors.length" color="error" variant="soft" icon="i-lucide-circle-alert" title="Please fix the following">
          <template #description>
            <ul class="list-disc pl-4">
              <li v-for="(e, i) in errors" :key="i">
                {{ e }}
              </li>
            </ul>
          </template>
        </UAlert>

        <UCard>
          <div class="space-y-4">
            <UFormField label="Name" required>
              <UInput v-model="name" placeholder="My Application" class="w-full" autofocus />
            </UFormField>

            <UFormField label="Type" required>
              <USelect v-model="type" :items="typeItems" class="w-full" />
            </UFormField>

            <UFormField label="Redirect URIs" required help="Absolute URLs, no URL fragment (#).">
              <div class="space-y-2">
                <div v-for="(_uri, i) in redirectUris" :key="i" class="flex gap-2">
                  <UInput v-model="redirectUris[i]" placeholder="https://app.example.com/callback" class="w-full" />
                  <UButton icon="i-lucide-x" color="neutral" variant="ghost" aria-label="Remove URI" @click="removeUri(i)" />
                </div>
                <UButton icon="i-lucide-plus" variant="ghost" size="xs" label="Add URI" @click="addUri" />
              </div>
            </UFormField>

            <UFormField>
              <UCheckbox v-model="isPublic" label="Public client (PKCE, no secret)" help="For SPAs and native apps that can't keep a secret." />
            </UFormField>
            <UFormField>
              <UCheckbox v-model="skipConsent" label="Skip consent screen" help="Trusted first-party apps only." />
            </UFormField>

            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" label="Cancel" to="/platform/applications" />
              <UButton label="Create application" :loading="submitting" @click="submit" />
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <PlatformClientSecretModal v-model:open="secretOpen" :client-id="createdClientId" :client-secret="createdSecret" @acknowledged="onSecretAck" />
</template>
