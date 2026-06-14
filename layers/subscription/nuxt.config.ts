// Subscription layer — the Nord Account portal front end (home dashboard, product
// pages, plans, billing, family seats). Backend stays centralized in root server/.
// Auto-discovered by Nuxt because it lives under <root>/layers/. The $meta.name
// generates the #layers/subscription alias.
export default defineNuxtConfig({
  $meta: {
    name: 'subscription',
  },
})
