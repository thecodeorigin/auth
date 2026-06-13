import { apiKey } from '@better-auth/api-key'
import { oauthProvider } from '@better-auth/oauth-provider'
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'
import { admin as adminPlugin, jwt, openAPI, organization } from 'better-auth/plugins'
import { ac, roles } from '#shared/permissions'
import { getAuthorizationClaims } from './services/member'
import { getClientOrigins } from './services/oauth'
import { ensurePersonalOrgIfVerified, grantAllAppsScope, removeMemberAppScopes, removeOrgAppScopes } from './services/organization'
import { sendEmail } from './utils/email'

export default defineServerAuth(({ runtimeConfig }) => {
  const baseURL = runtimeConfig.public?.siteUrl || 'http://localhost:3000'

  return {
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      async sendResetPassword({ user, url }) {
        await sendEmail({
          to: user.email,
          subject: 'Reset your password',
          html: `<p>Reset your password:</p><p><a href="${url}">Reset password</a></p>`,
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      async sendVerificationEmail({ user, url }) {
        await sendEmail({
          to: user.email,
          subject: 'Verify your email',
          html: `<p>Confirm your email:</p><p><a href="${url}">Verify email</a></p>`,
        })
      },
    },
    socialProviders: {
      google: {
        clientId: runtimeConfig.googleClientId,
        clientSecret: runtimeConfig.googleClientSecret,
      },
      github: {
        clientId: runtimeConfig.githubClientId,
        clientSecret: runtimeConfig.githubClientSecret,
      },
    },

    trustedOrigins: getClientOrigins,

    databaseHooks: {
      session: {
        create: {
          // Fires when a verified user establishes a session = "first verified sign-in".
          after: async (session) => {
            // never block sign-in
            try {
              await ensurePersonalOrgIfVerified(session.userId)
            }
            catch (error) {
              console.error('[auth] ensurePersonalOrg failed', session.userId, error)
            }
          },
        },
      },
    },

    plugins: [
      jwt({
        jwks: { keyPairConfig: { alg: 'RS256', modulusLength: 2048 } },
        jwt: { issuer: `${baseURL}/api/auth` },
      }),
      oauthProvider({
        loginPage: '/sign-in',
        consentPage: '/oauth/consent',
        storeClientSecret: 'hashed',
        // id_token hook gets `metadata` (parsed oauthClient.metadata), NOT client_id.
        async customIdTokenClaims({ user, metadata }) {
          const clientId = (metadata as { clientId?: string } | undefined)?.clientId ?? null
          if (!clientId)
            console.warn('[auth] id_token: client has no metadata.clientId — emitting unscoped claims', user.id)
          return getAuthorizationClaims(user.id, clientId)
        },
        // userinfo hook gets the validated access-token payload; azp = requesting client.
        async customUserInfoClaims({ user, jwt }) {
          const clientId = (jwt as { azp?: string, client_id?: string } | undefined)?.azp
            ?? (jwt as { client_id?: string } | undefined)?.client_id ?? null
          return getAuthorizationClaims(user.id, clientId)
        },
      }),
      adminPlugin({
        adminUserIds: runtimeConfig.adminUserIds
          ? runtimeConfig.adminUserIds.split(',').filter(Boolean)
          : [],
        impersonationSessionDuration: 60 * 30,
      }),
      organization({
        ac,
        roles,
        dynamicAccessControl: {
          enabled: true,
          maximumRolesPerOrganization: 10,
        },
        // default-closed: the creator of ANY org (custom orgs via organization.create) gets all-apps access.
        organizationHooks: {
          afterCreateOrganization: async ({ organization: org, user }) => {
            try {
              await grantAllAppsScope(org.id, user.id)
            }
            catch (error) {
              console.error('[auth] grantAllAppsScope (afterCreateOrganization) failed', org.id, error)
            }
          },
          // D1 has no FK cascade — explicitly clean up memberAppScope rows (AC6).
          afterRemoveMember: async ({ member: removed, organization: org }) => {
            try {
              await removeMemberAppScopes(org.id, removed.userId)
            }
            catch (error) {
              console.error('[auth] removeMemberAppScopes (afterRemoveMember) failed', org.id, removed.userId, error)
            }
          },
          beforeDeleteOrganization: async ({ organization: org }) => {
            try {
              await removeOrgAppScopes(org.id)
            }
            catch (error) {
              console.error('[auth] removeOrgAppScopes (beforeDeleteOrganization) failed', org.id, error)
            }
          },
        },
      }),
      apiKey({
        enableSessionForAPIKeys: true,
      }),
      openAPI(),
    ],
  }
})
