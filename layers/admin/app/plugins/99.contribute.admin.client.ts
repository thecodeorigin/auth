export default defineNuxtPlugin(() => {
  useLayerRegistry().contribute({
    navItems: [
      // Admin (system-admin) main. Same leading order as the member view
      // (Applications, Users) then the platform-only items.
      { id: 'a-applications', label: 'Applications', icon: 'i-lucide-layout-grid', to: '/platform/applications', section: 'main', priority: 10, role: 'admin' },
      { id: 'a-users', label: 'Users', icon: 'i-lucide-users-round', to: '/platform/users', section: 'main', priority: 20, role: 'admin' },
      { id: 'a-organizations', label: 'Organizations', icon: 'i-lucide-building-2', to: '/platform/organizations', section: 'main', priority: 30, role: 'admin' },
      { id: 'a-consents', label: 'Consents', icon: 'i-lucide-shield-check', to: '/platform/consents', section: 'main', priority: 40, role: 'admin' },
      { id: 'a-api-keys', label: 'API Keys', icon: 'i-lucide-key-round', to: '/platform/api-keys', section: 'main', priority: 50, role: 'admin' },
      { id: 'a-providers', label: 'Providers', icon: 'i-lucide-plug', to: '/platform/providers', section: 'main', priority: 60, role: 'admin' },
    ],
  })
})
