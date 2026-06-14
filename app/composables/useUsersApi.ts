/**
 * Platform user administration — wraps `client.admin.*`. This is the single
 * place the better-auth admin method names live (SEC-NAMES). Method names were
 * verified against better-auth's `/admin/*` endpoint inventory.
 */
export function useUsersApi() {
  const client = useAuthClient()
  function c() {
    if (!client)
      throw createError({ statusCode: 500, statusMessage: 'Auth client unavailable' })
    return client
  }
  return {
    list: (q: { searchValue?: string, limit?: number, offset?: number }) => c().admin.listUsers({ query: q }),
    get: (id: string) => c().admin.getUser({ query: { id } }),
    create: (b: { name: string, email: string, password: string, role?: 'admin' | 'user', data?: Record<string, unknown> }) => c().admin.createUser(b),
    update: (b: { userId: string, data: Record<string, unknown> }) => c().admin.updateUser(b),
    remove: (userId: string) => c().admin.removeUser({ userId }),
    setRole: (userId: string, role: 'admin' | 'user') => c().admin.setRole({ userId, role }),
    setPassword: (userId: string, newPassword: string) => c().admin.setUserPassword({ userId, newPassword }),
    ban: (b: { userId: string, banReason?: string, banExpiresIn?: number }) => c().admin.banUser(b),
    unban: (userId: string) => c().admin.unbanUser({ userId }),
    listSessions: (userId: string) => c().admin.listUserSessions({ userId }),
    revokeSession: (sessionToken: string) => c().admin.revokeUserSession({ sessionToken }),
    revokeSessions: (userId: string) => c().admin.revokeUserSessions({ userId }),
    impersonate: (userId: string) => c().admin.impersonateUser({ userId }),
    stopImpersonating: () => c().admin.stopImpersonating(),
  }
}
