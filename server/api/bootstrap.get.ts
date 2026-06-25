export default defineEventHandler(async (event) => {
  const session = await getUserSession(event)
  if (!session?.user)
    return { activeOrg: null, memberRole: null }

  const auth = serverAuth(event)
  const [orgRes, roleRes] = await Promise.allSettled([
    auth.api.getFullOrganization({ headers: event.headers }),
    auth.api.getActiveMemberRole({ headers: event.headers }),
  ])

  const org = orgRes.status === 'fulfilled'
    ? (orgRes.value as { id: string, slug?: string | null, name: string } | null)
    : null
  const memberRole = roleRes.status === 'fulfilled'
    ? ((roleRes.value as { role?: string } | null)?.role ?? null)
    : null

  return {
    activeOrg: org ? { id: org.id, slug: org.slug ?? null, name: org.name } : null,
    memberRole,
  }
})
