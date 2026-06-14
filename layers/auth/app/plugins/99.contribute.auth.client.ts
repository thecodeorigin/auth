export default defineNuxtPlugin(() => {
  useLayerRegistry().contribute({
    navItems: [
      // Member main: business-facing account items. (Owned products live on the
      // Home dashboard; there is no separate OAuth "authorized apps" surface.)
      { id: 'm-api-keys', label: 'API Keys', icon: 'i-lucide-key', to: '/account/api-keys', section: 'main', priority: 40, role: 'member' },

      // Settings group (both roles — always the signed-in user's own account).
      { id: 'set-profile', label: 'Profile', icon: 'i-lucide-user', to: '/account/profile', section: 'settings', priority: 0 },
      { id: 'set-security', label: 'Security', icon: 'i-lucide-shield', to: '/account/security', section: 'settings', priority: 10 },
      { id: 'set-connected', label: 'Connected Accounts', icon: 'i-lucide-link', to: '/account/connected-accounts', section: 'settings', priority: 20 },
    ],
  })
})
