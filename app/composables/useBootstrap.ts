export interface BootstrapData {
  activeOrg: { id: string, slug: string | null, name: string } | null
  memberRole: string | null
}

/**
 * SSR-resolves the dashboard "head" (active-org slug + member role) once and
 * seeds the shared state consumed by the sidebar nav and the CASL ability plugin.
 * Deduped by the `bootstrap` key — calling from multiple places is free.
 */
export function useBootstrap() {
  const { loggedIn } = useUserSession()
  const activeOrgSlug = useState<string | null>('activeOrgSlug', () => null)
  const activeMemberRole = useState<string | null>('ability.orgRole', () => null)

  const { data, refresh } = useAsyncData<BootstrapData>('bootstrap', () => {
    if (!loggedIn.value)
      return Promise.resolve({ activeOrg: null, memberRole: null })
    return $http<BootstrapData>('/api/bootstrap', { silent: true })
  })

  watchEffect(() => {
    if (!data.value)
      return
    activeOrgSlug.value = data.value.activeOrg?.slug ?? null
    activeMemberRole.value = data.value.memberRole ?? null
  })

  return { bootstrap: data, refresh, activeOrgSlug, activeMemberRole }
}
