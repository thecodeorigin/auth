/**
 * Account scope for the signed-in user — wraps core better-auth client methods
 * (no plugin namespace). Single source of these method names (SEC-NAMES),
 * verified against better-auth's core endpoint inventory. `client.oauth2.*` is
 * never used here (SEC-OAUTH) — authorized-apps go through useApplicationsApi.
 */
export function useAccountApi() {
  const client = useAuthClient()
  const { signOut, updateUser, fetchSession } = useUserSession()
  function c() {
    if (!client)
      throw createError({ statusCode: 500, statusMessage: 'Auth client unavailable' })
    return client
  }
  return {
    // Profile
    update: (data: { name?: string, image?: string | null }) => updateUser(data),
    signOut,
    refresh: () => fetchSession({ force: true }),

    // Security
    changePassword: (b: { currentPassword: string, newPassword: string, revokeOtherSessions?: boolean }) => c().changePassword(b),
    requestPasswordReset: (email: string) => c().requestPasswordReset({ email, redirectTo: `${window.location.origin}/reset-password` }),
    changeEmail: (b: { newEmail: string, callbackURL?: string }) => c().changeEmail(b),
    sendVerificationEmail: (b: { email: string, callbackURL?: string }) => c().sendVerificationEmail(b),
    deleteSelf: (b?: { password?: string, callbackURL?: string }) => c().deleteUser(b ?? {}),

    // Sessions
    listSessions: () => c().listSessions(),
    revokeSession: (token: string) => c().revokeSession({ token }),
    revokeOtherSessions: () => c().revokeOtherSessions(),
    revokeSessions: () => c().revokeSessions(),

    // Connected social accounts
    listAccounts: () => c().listAccounts(),
    linkSocial: (b: { provider: string, callbackURL?: string }) => c().linkSocial(b),
    unlinkAccount: (b: { providerId: string, accountId?: string }) => c().unlinkAccount(b),
  }
}
