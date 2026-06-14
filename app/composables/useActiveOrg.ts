/**
 * Resolves the active organization (full detail) from the session and publishes
 * its slug to a shared state so the sidebar nav can build `/orgs/:slug/*` links.
 * Also mirrors the active member role into `ability.orgRole` for $ability.
 */
export function useActiveOrg() {
  const { session, fetchSession } = useUserSession()
  const orgApi = useOrgApi()
  const activeOrgSlug = useState<string | null>('activeOrgSlug', () => null)
  const activeMemberRole = useState<string | null>('ability.orgRole', () => null)
  const autoSelecting = useState<boolean>('activeOrg.autoSelecting', () => false)

  const activeOrgId = computed(() => session.value?.activeOrganizationId ?? null)

  // Members land without an active org set; auto-select their first org once so
  // the org-scoped nav (Users, Invitations) and pages have a context to use.
  watch(activeOrgId, async () => {
    if (!import.meta.client || activeOrgId.value || autoSelecting.value)
      return
    autoSelecting.value = true
    try {
      const { data } = await orgApi.list()
      const first = (data ?? [])[0]
      if (first) {
        await orgApi.setActive(first.id)
        await fetchSession({ force: true })
      }
    }
    catch {
      // no orgs / not ready — nav simply omits org items
    }
    finally {
      autoSelecting.value = false
    }
  }, { immediate: true })

  // The better-auth client only carries the session in the browser, so all
  // resolution happens client-side (SSR has no cookie on the better-fetch
  // client and useAuthClient() is null there).
  const { data: org, refresh, pending } = useAsyncData(
    'active-org',
    async () => {
      if (!activeOrgId.value)
        return null
      const { data } = await orgApi.getFull()
      return data ?? null
    },
    { watch: [activeOrgId], server: false },
  )

  watch(org, (o) => {
    activeOrgSlug.value = (o as { slug?: string } | null)?.slug ?? null
  }, { immediate: true })

  // Keep $ability's org role in sync with the active org (client only).
  watch(activeOrgId, () => {
    if (!import.meta.client)
      return
    if (!activeOrgId.value) {
      activeMemberRole.value = null
      return
    }
    orgApi.getActiveMemberRole()
      .then(({ data }) => { activeMemberRole.value = (data as { role?: string } | null)?.role ?? null })
      .catch(() => { activeMemberRole.value = null })
  }, { immediate: true })

  return { org, activeOrgId, activeOrgSlug, refresh, pending }
}
