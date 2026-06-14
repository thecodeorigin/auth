<script setup lang="ts">
import type { CommandPaletteItem, NavigationMenuItem } from '@nuxt/ui'
import type { RegistryNavItem } from '~/composables/useLayerRegistry'
import ImpersonateMenu from '#layers/auth/app/components/Impersonate/ImpersonateMenu.vue'
import UserMenu from '#layers/auth/app/components/User/UserMenu.vue'
import OrganizationMenu from '#layers/organization/app/components/Organization/OrganizationMenu.vue'

const open = ref(false)
const colorMode = useColorMode()
const registry = useLayerRegistry()
const { $ability } = useNuxtApp()
const { user, session, fetchSession } = useUserSession()
const { activeOrgSlug } = useActiveOrg()

// SEC-IMP: impersonation banner is session-sourced (never a local ref) and
// lives at layout level so it's globally visible across every dashboard page.
const isImpersonating = computed(() => !!session.value?.impersonatedBy)

// SEC-IMP: prefix the document title while impersonating.
useHead({
  titleTemplate: title => (isImpersonating.value
    ? `[Impersonating] ${title ?? 'Console'}`
    : (title ?? 'Console')),
})

async function stopImpersonating() {
  await useUsersApi().stopImpersonating()
  await fetchSession({ force: true })
  if (import.meta.client)
    window.location.reload()
}

function closeMenu() {
  open.value = false
}
function setTheme(pref: string) {
  colorMode.preference = pref
}

// Org nav links carry a `:slug` placeholder; resolve it from the active org.
function resolveTo(to?: string): string | undefined {
  if (!to)
    return to
  if (to.includes(':slug'))
    return activeOrgSlug.value ? to.replace(':slug', activeOrgSlug.value) : undefined
  return to
}

function canShow(item: RegistryNavItem): boolean {
  // Role gate: admin-only items hide for members, member-only items hide for admins.
  const isAdmin = user.value?.role === 'admin'
  if (item.role === 'admin' && !isAdmin)
    return false
  if (item.role === 'member' && isAdmin)
    return false
  // Hide org-scoped items until an active org is resolved.
  if (item.to?.includes(':slug') && !activeOrgSlug.value)
    return false
  if (!item.ability)
    return true
  const abs = Array.isArray(item.ability) ? item.ability : [item.ability]
  return abs.some((a) => {
    const [s = '', ac = ''] = a.split(':')
    return $ability.can(ac, s)
  })
}

function toMenuItem(item: RegistryNavItem): NavigationMenuItem {
  return {
    label: item.label,
    icon: item.icon,
    to: resolveTo(item.to),
    type: item.type,
    defaultOpen: item.defaultOpen,
    children: item.children?.filter(canShow).map(toMenuItem),
    onSelect() {
      item.onSelect?.()
      if (!item.children?.length)
        closeMenu()
    },
  }
}

const links = computed<NavigationMenuItem[][]>(() => {
  const sorted = [...registry.navItems.value].sort((a, b) => a.priority - b.priority)

  const mainItems = sorted
    .filter(i => i.section === 'main' && canShow(i))
    .map(toMenuItem)

  const settingsChildren = sorted
    .filter(i => i.section === 'settings' && canShow(i))
    .map(toMenuItem)

  const settingsGroup: NavigationMenuItem = {
    label: 'Settings',
    icon: 'i-lucide-settings',
    defaultOpen: true,
    type: 'trigger',
    children: settingsChildren,
  }

  const subItems = sorted
    .filter(i => i.section === 'sub' && canShow(i))
    .map(toMenuItem)

  return [[...mainItems, settingsGroup], subItems]
})

const groups = computed(() => [{
  id: 'goto',
  label: 'Go to',
  items: links.value.flat().flatMap(i => (i.children?.length ? i.children : [i])) as CommandPaletteItem[],
}, {
  id: 'theme',
  label: 'Theme',
  items: [
    { label: 'System', icon: 'i-lucide-monitor', onSelect: () => setTheme('system') },
    { label: 'Light', icon: 'i-lucide-sun', onSelect: () => setTheme('light') },
    { label: 'Dark', icon: 'i-lucide-moon', onSelect: () => setTheme('dark') },
  ],
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{
        header: 'lg:border-b lg:border-default',
        footer: 'lg:border-t lg:border-default',
        body: 'gap-2 py-4',
      }"
    >
      <template #header="{ collapsed }">
        <OrganizationMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <ImpersonateMenu :collapsed="collapsed" />

        <ClientOnly>
          <UNavigationMenu
            :collapsed="collapsed"
            :items="links[0]"
            orientation="vertical"
            tooltip
            popover
          />

          <UNavigationMenu
            :collapsed="collapsed"
            :items="links[1]"
            orientation="vertical"
            tooltip
            popover
            class="mt-auto"
          />
        </ClientOnly>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <div class="flex flex-col flex-1 min-w-0">
      <ClientOnly>
        <UBanner
          v-if="isImpersonating"
          color="warning"
          icon="i-lucide-shield-alert"
          :title="`Impersonating ${user?.email ?? 'user'} — destructive admin actions are disabled.`"
          :actions="[{ label: 'Stop', color: 'neutral', variant: 'outline', onClick: stopImpersonating }]"
        />
      </ClientOnly>
      <slot />
    </div>

    <ClientOnly>
      <component
        :is="overlay.component"
        v-for="overlay in registry.overlays.value"
        :key="overlay.id"
      />
    </ClientOnly>
  </UDashboardGroup>
</template>
