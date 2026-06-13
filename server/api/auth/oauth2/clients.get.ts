export default defineEventHandler(async (event) => {
  // Any authenticated user may read the client catalog: it exposes only clientId/name/disabled
  // (no secrets), and org owners/admins need it to grant per-app access (the grant/revoke
  // endpoints are independently org-admin gated). System-admin gating here locked out org owners.
  await requireUserSession(event)
  return listOAuthClients()
})
