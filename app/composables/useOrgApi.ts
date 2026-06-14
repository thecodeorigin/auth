/**
 * Organization scope — wraps `client.organization.*`. Single source of the
 * better-auth organization method names (SEC-NAMES), verified against the
 * `/organization/*` endpoint inventory.
 */
export function useOrgApi() {
  const client = useAuthClient()
  function c() {
    if (!client)
      throw createError({ statusCode: 500, statusMessage: 'Auth client unavailable' })
    return client
  }
  return {
    // Org lifecycle + switching
    list: (q?: { limit?: number, offset?: number }) => c().organization.list(q ? { query: q } : undefined),
    create: (b: { name: string, slug?: string }) => c().organization.create({
      name: b.name,
      slug: b.slug ?? b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    }),
    update: (b: { organizationId: string, data: Record<string, unknown> }) => c().organization.update(b),
    remove: (organizationId: string) => c().organization.delete({ organizationId }),
    setActive: (organizationId: string | null) => c().organization.setActive({ organizationId }),
    checkSlug: (slug: string) => c().organization.checkSlug({ slug }),
    leave: (organizationId: string) => c().organization.leave({ organizationId }),
    getFull: (q?: { organizationId?: string, organizationSlug?: string }) => c().organization.getFullOrganization(q ? { query: q } : undefined),
    getActiveMemberRole: () => c().organization.getActiveMemberRole(),

    // Members
    listMembers: (q?: { organizationId?: string, limit?: number, offset?: number }) => c().organization.listMembers(q ? { query: q } : undefined),
    removeMember: (b: { memberIdOrEmail: string, organizationId?: string }) => c().organization.removeMember(b),
    updateMemberRole: (b: { memberId: string, role: string, organizationId?: string }) => c().organization.updateMemberRole(b),

    // Invitations
    invite: (b: { email: string, role: string, organizationId?: string }) => c().organization.inviteMember(b),
    listInvitations: (q?: { organizationId?: string }) => c().organization.listInvitations(q ? { query: q } : undefined),
    listMyInvitations: () => c().organization.listUserInvitations(),
    cancelInvitation: (invitationId: string) => c().organization.cancelInvitation({ invitationId }),
    acceptInvitation: (invitationId: string) => c().organization.acceptInvitation({ invitationId }),
    rejectInvitation: (invitationId: string) => c().organization.rejectInvitation({ invitationId }),
    getInvitation: (id: string) => c().organization.getInvitation({ query: { id } }),

    // Dynamic roles
    listRoles: (q?: { organizationId?: string }) => c().organization.listRoles(q ? { query: q } : undefined),
    getRole: (q: { organizationId?: string, roleName: string }) => c().organization.getRole({ query: q }),
    createRole: (b: { role: string, permission: Record<string, string[]>, organizationId?: string }) => c().organization.createRole(b),
    updateRole: (b: { roleName: string, data: Record<string, unknown>, organizationId?: string }) => c().organization.updateRole(b),
    deleteRole: (b: { roleName: string, organizationId?: string }) => c().organization.deleteRole(b),
    hasPermission: (b: { permissions: Record<string, string[]> }) => c().organization.hasPermission(b),
  }
}
