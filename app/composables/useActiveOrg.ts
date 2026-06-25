/**
 * Resolves the active organization for the dashboard. The active-org slug and
 * the member role are SSR-resolved via `useBootstrap()` (collapsing the old
 * client-side waterfall head). This composable adds: (1) the first-load
 * auto-select of a member's first org when none is active, and (2) the full org
 * detail used by org-scoped pages.
 */
export function useActiveOrg() {
  const { session, fetchSession } = useUserSession()
  const orgApi = useOrgApi()
  const autoSelecting = useState<boolean>('activeOrg.autoSelecting', () => false)

  const activeOrgId = computed(() => session.value?.activeOrganizationId ?? null)

  // SSR-seeded slug + role (shared state). refreshBootstrap re-resolves after
  // an org switch below.
  const { activeOrgSlug, activeMemberRole, refresh: refreshBootstrap } = useBootstrap()

  // Members land without an active org; auto-select their first one once (client
  // only, first-ever load — the common returning case already has activeOrgId).
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
        await refreshBootstrap()
      }
    }
    catch {
      // no orgs / not ready — nav simply omits org items
    }
    finally {
      autoSelecting.value = false
    }
  }, { immediate: true })

  // Full org detail for org-scoped pages. Client-only for now; refines (never
  // nulls) the bootstrap-seeded slug when it loads.
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
    const slug = (o as { slug?: string } | null)?.slug
    if (slug)
      activeOrgSlug.value = slug
  })

  return { org, activeOrgId, activeOrgSlug, activeMemberRole, refresh, pending }
}
