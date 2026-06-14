export default defineNuxtPlugin(() => {
  useLayerRegistry().contribute({
    navItems: [
      // Member org management. `:slug` resolves to the active org (layout hides
      // these until an org is active). Members manage their org's people here.
      { id: 'm-users', label: 'Users', icon: 'i-lucide-users', to: '/orgs/:slug/members', section: 'main', priority: 20, role: 'member' },
      { id: 'm-invitations', label: 'Invitations', icon: 'i-lucide-mail', to: '/orgs/:slug/invitations', section: 'main', priority: 30, role: 'member' },
    ],
  })
})
