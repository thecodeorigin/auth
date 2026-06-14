<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import * as z from 'zod'
import DashboardNavbar from '~/components/Dashboard/DashboardNavbar.vue'

interface SessionRow {
  id: string
  token: string
  createdAt: string | Date
  ipAddress?: string | null
  userAgent?: string | null
  expiresAt?: string | Date
}

const account = useAccountApi()
const { session } = useUserSession()
const toast = useToast()
const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

// --- Change password ---
const pwSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newPassword: z.string().min(8, 'At least 8 characters'),
  confirm: z.string(),
}).refine(d => d.newPassword === d.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type PwSchema = z.output<typeof pwSchema>
const pwState = reactive({ currentPassword: '', newPassword: '', confirm: '' })
const savingPw = ref(false)

async function changePassword(event: { data: PwSchema }) {
  savingPw.value = true
  try {
    const { error } = await account.changePassword({ currentPassword: event.data.currentPassword, newPassword: event.data.newPassword, revokeOtherSessions: true })
    if (error)
      throw new Error(error.message ?? 'Failed to change password')
    toast.add({ title: 'Password changed', color: 'success' })
    Object.assign(pwState, { currentPassword: '', newPassword: '', confirm: '' })
    await loadSessions()
  }
  catch (err) {
    toast.add({ title: 'Change failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    savingPw.value = false
  }
}

// --- Change email ---
const emailSchema = z.object({ newEmail: z.string().email('Enter a valid email') })
type EmailSchema = z.output<typeof emailSchema>
const emailState = reactive({ newEmail: '' })
const savingEmail = ref(false)

async function changeEmail(event: { data: EmailSchema }) {
  savingEmail.value = true
  try {
    const { error } = await account.changeEmail({ newEmail: event.data.newEmail, callbackURL: '/account/security' })
    if (error)
      throw new Error(error.message ?? 'Failed to change email')
    toast.add({ title: 'Verification sent', description: 'Check your new inbox to confirm the change.', color: 'success' })
    emailState.newEmail = ''
  }
  catch (err) {
    toast.add({ title: 'Change failed', description: (err as Error).message, color: 'error' })
  }
  finally {
    savingEmail.value = false
  }
}

// --- Active sessions ---
const sessions = ref<SessionRow[]>([])
const loadingSessions = ref(true)

async function loadSessions() {
  loadingSessions.value = true
  try {
    const { data } = await account.listSessions()
    sessions.value = (data ?? []) as SessionRow[]
  }
  finally {
    loadingSessions.value = false
  }
}
onMounted(loadSessions)

const currentToken = computed(() => session.value?.token)

async function revoke(token: string) {
  try {
    await account.revokeSession(token)
    toast.add({ title: 'Session revoked', color: 'success' })
    await loadSessions()
  }
  catch (err) {
    toast.add({ title: 'Revoke failed', description: (err as Error).message, color: 'error' })
  }
}

async function revokeOthers() {
  try {
    await account.revokeOtherSessions()
    toast.add({ title: 'Other sessions revoked', color: 'success' })
    await loadSessions()
  }
  catch (err) {
    toast.add({ title: 'Revoke failed', description: (err as Error).message, color: 'error' })
  }
}

const sessionColumns: TableColumn<SessionRow>[] = [
  {
    id: 'device',
    header: 'Device',
    cell: ({ row }) => h('div', [
      h('p', { class: 'text-sm truncate max-w-xs' }, row.original.userAgent ?? 'Unknown device'),
      h('p', { class: 'text-xs text-muted' }, row.original.ipAddress ?? ''),
    ]),
  },
  {
    id: 'created',
    header: 'Signed in',
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(),
  },
  {
    id: 'actions',
    header: '',
    meta: { class: { td: 'text-right' } },
    cell: ({ row }) => (row.original.token === currentToken.value
      ? h(UBadge, { color: 'primary', variant: 'subtle' }, () => 'Current')
      : h(UButton, { color: 'error', variant: 'ghost', size: 'xs', label: 'Revoke', onClick: () => revoke(row.original.token) })),
  },
]

const hasOthers = computed(() => sessions.value.some(s => s.token !== currentToken.value))
</script>

<template>
  <UDashboardPanel id="account-security">
    <template #header>
      <DashboardNavbar title="Security" />
    </template>

    <template #body>
      <div class="max-w-2xl space-y-6">
        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Change password
            </h2>
          </template>
          <UForm :schema="pwSchema" :state="pwState" class="space-y-4" @submit="changePassword">
            <UFormField label="Current password" name="currentPassword" required>
              <UInput v-model="pwState.currentPassword" type="password" class="w-full" />
            </UFormField>
            <UFormField label="New password" name="newPassword" required help="Minimum 8 characters">
              <UInput v-model="pwState.newPassword" type="password" class="w-full" />
            </UFormField>
            <UFormField label="Confirm new password" name="confirm" required>
              <UInput v-model="pwState.confirm" type="password" class="w-full" />
            </UFormField>
            <div class="flex justify-end">
              <UButton type="submit" label="Update password" :loading="savingPw" />
            </div>
          </UForm>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              Change email
            </h2>
          </template>
          <UForm :schema="emailSchema" :state="emailState" class="space-y-4" @submit="changeEmail">
            <UFormField label="New email" name="newEmail" required help="We'll send a verification link to confirm.">
              <UInput v-model="emailState.newEmail" type="email" class="w-full" />
            </UFormField>
            <div class="flex justify-end">
              <UButton type="submit" label="Send verification" :loading="savingEmail" />
            </div>
          </UForm>
        </UCard>

        <UCard :ui="{ body: 'sm:p-0' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-highlighted">
                Active sessions
              </h2>
              <UButton v-if="hasOthers" color="error" variant="subtle" size="xs" label="Revoke all others" @click="revokeOthers" />
            </div>
          </template>
          <UTable :columns="sessionColumns" :data="sessions" :loading="loadingSessions">
            <template #empty>
              <div class="text-center text-muted py-6">
                No active sessions.
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
