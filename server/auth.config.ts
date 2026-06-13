import { apiKey } from '@better-auth/api-key'
import { oauthProvider } from '@better-auth/oauth-provider'
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'
import { admin as adminPlugin, jwt, organization } from 'better-auth/plugins'
import { ac, roles } from '#shared/permissions'
import { sendEmail } from './utils/email'
import { hashClientSecret, parseOidcClients } from './utils/oidc'

interface AuthorizationClaims {
  org: string | null
  roles: string | null
}

async function getAuthorizationClaims(userId: string): Promise<AuthorizationClaims> {
  try {
    const [{ db }, { sql }] = await Promise.all([
      import('@nuxthub/db'),
      import('drizzle-orm'),
    ])
    const rows = await db.all<{ org: string | null, roles: string | null }>(
      sql`select "organizationId" as "org", "role" as "roles" from "member" where "userId" = ${userId} limit 1`,
    )
    const row = rows[0]
    return { org: row?.org ?? null, roles: row?.roles ?? null }
  }
  catch {
    return { org: null, roles: null }
  }
}

export default defineServerAuth(({ runtimeConfig }) => {
  const baseURL = runtimeConfig.public?.siteUrl || 'http://localhost:3000'
  const clients = parseOidcClients(runtimeConfig.oidcClients)

  const socialProviders: Record<string, { clientId: string, clientSecret: string }> = {}
  if (runtimeConfig.googleClientId && runtimeConfig.googleClientSecret)
    socialProviders.google = { clientId: runtimeConfig.googleClientId, clientSecret: runtimeConfig.googleClientSecret }
  if (runtimeConfig.githubClientId && runtimeConfig.githubClientSecret)
    socialProviders.github = { clientId: runtimeConfig.githubClientId, clientSecret: runtimeConfig.githubClientSecret }

  return {
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
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
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Verify your email',
          html: `<p>Confirm your email:</p><p><a href="${url}">Verify email</a></p>`,
        })
      },
    },
    ...(Object.keys(socialProviders).length ? { socialProviders } : {}),
    trustedOrigins: [
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
    ],

    plugins: [
      jwt({
        jwks: { keyPairConfig: { alg: 'RS256', modulusLength: 2048 } },
        jwt: { issuer: `${baseURL}/api/auth` },
      }),
      oauthProvider({
        loginPage: '/sign-in',
        consentPage: '/oauth/consent',
        cachedTrustedClients: new Set(clients.map(client => client.clientId)),
        storeClientSecret: {
          hash: hashClientSecret,
          verify: async (secret, stored) => (await hashClientSecret(secret)) === stored,
        },
        customIdTokenClaims: async ({ user }) => getAuthorizationClaims(user.id),
        customUserInfoClaims: async ({ user }) => getAuthorizationClaims(user.id),
      }),
      adminPlugin({
        adminUserIds: runtimeConfig.adminUserIds ? runtimeConfig.adminUserIds.split(',').filter(Boolean) : [],
        impersonationSessionDuration: 60 * 30,
      }),
      organization({
        ac,
        roles,
        dynamicAccessControl: { enabled: true, maximumRolesPerOrganization: 10 },
      }),
      apiKey({
        enableSessionForAPIKeys: true,
      }),
    ],
  }
})
