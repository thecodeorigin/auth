export default defineEventHandler(async () => {
  // Public-ish flag so the UI can hide checkout/portal when billing is unconfigured.
  return { polarConfigured: isPolarConfigured() }
})
