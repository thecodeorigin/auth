export default defineNuxtPlugin(() => {
  useLayerRegistry().contribute({
    navItems: [
      // Home (/) is the products dashboard — shown to members (non-admins).
      { id: 's-home', label: 'Home', icon: 'i-lucide-home', to: '/', section: 'main', priority: 5, role: 'member' },
      { id: 's-plans', label: 'Available plans', icon: 'i-lucide-sparkles', to: '/account/plans', section: 'main', priority: 50, role: 'member' },
      { id: 's-billing', label: 'Billing', icon: 'i-lucide-credit-card', to: '/account/billing', section: 'main', priority: 60, role: 'member' },
    ],
  })
})
