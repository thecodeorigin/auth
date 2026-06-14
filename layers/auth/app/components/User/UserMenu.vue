<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{ collapsed?: boolean }>()

const colorMode = useColorMode()
const { user, session } = useUserSession()
const account = useAccountApi()
const usersApi = useUsersApi()
const toast = useToast()

// SEC-IMP: impersonation state is read from the server-returned session.
const isImpersonating = computed(() => !!session.value?.impersonatedBy)

const display = computed(() => ({
  name: user.value?.name || user.value?.email || 'Guest',
  email: user.value?.email ?? '',
  avatar: user.value?.image
    ? { src: user.value.image, alt: user.value.name ?? '' }
    : undefined,
}))

async function logout() {
  try {
    await account.signOut()
  }
  finally {
    await navigateTo('/sign-in')
  }
}

function pickMode(e: Event, pref: 'light' | 'dark' | 'system') {
  e.preventDefault()
  colorMode.preference = pref
}

async function stopImpersonating() {
  try {
    await usersApi.stopImpersonating()
    toast.add({ title: 'Stopped impersonation', color: 'success' })
    if (import.meta.client)
      window.location.reload()
  }
  catch (err) {
    toast.add({ title: 'Stop impersonation failed', description: (err as Error).message, color: 'error' })
  }
}

const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = []

  groups.push([{ type: 'label', label: display.value.name, avatar: display.value.avatar }])

  if (isImpersonating.value) {
    groups.push([{
      label: 'Stop impersonating',
      icon: 'i-lucide-shield',
      color: 'warning' as const,
      onSelect: () => { void stopImpersonating() },
    }])
  }

  groups.push([{ label: 'Profile', icon: 'i-lucide-user', to: '/account/profile' }])

  groups.push([{
    label: 'Appearance',
    icon: 'i-lucide-sun-moon',
    children: [
      { label: 'Light', icon: 'i-lucide-sun', type: 'checkbox', checked: colorMode.value === 'light', onSelect: (e: Event) => pickMode(e, 'light') },
      { label: 'Dark', icon: 'i-lucide-moon', type: 'checkbox', checked: colorMode.value === 'dark', onSelect: (e: Event) => pickMode(e, 'dark') },
      { label: 'System', icon: 'i-lucide-laptop', type: 'checkbox', checked: colorMode.preference === 'system', onSelect: (e: Event) => pickMode(e, 'system') },
    ],
  }])

  groups.push([{
    label: 'Log out',
    icon: 'i-lucide-log-out',
    onSelect: () => { void logout() },
  }])

  return groups
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-56' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      v-bind="display.avatar ? { avatar: display.avatar } : { icon: 'i-lucide-user' }"
      :label="collapsed ? undefined : display.name"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated"
      :ui="{ trailingIcon: 'text-dimmed' }"
      data-testid="user-menu-trigger"
    />
  </UDropdownMenu>
</template>
