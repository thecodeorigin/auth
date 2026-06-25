import { apiKey } from '@better-auth/api-key'
import { oauthProvider } from '@better-auth/oauth-provider'
import { defineServerAuth } from '@onmax/nuxt-better-auth/config'
import { checkout, polar, portal, usage, webhooks } from '@polar-sh/better-auth'
import { Polar } from '@polar-sh/sdk'
import { admin as adminPlugin, jwt, openAPI, organization } from 'better-auth/plugins'
import { ac, roles } from '#shared/permissions'
import { abilitiesResolve } from './services/abilities'
import { accessClearMember, accessClearOrg, accessGrantAll } from './services/access'
import { claimsResolve, claimsResolveAll } from './services/claims'
import { clientListOrigins } from './services/client'
import { entitlementsResolve } from './services/entitlements'
import { orgEnsurePersonal } from './services/org'
import { subscriptionClearForUser, subscriptionUpsertFromPolar } from './services/subscription'
import { sendEmail } from './utils/email'
import { getDevWebhookSecret } from './utils/polar'

/**
 * The Polar webhook payloads (`p.data`) are parsed SDK objects (camelCase, Date
 * fields). subscriptionUpsertFromPolar normalizes on the wire shape (snake_case,
 * ISO strings), so map at the boundary here. Typed structurally against the SDK
 * Subscription fields we read — no `any`.
 */
function polarSubToInput(d: {
  id: string
  status: string
  currentPeriodEnd?: Date | null
  cancelAtPeriodEnd?: boolean
  modifiedAt?: Date | null
  productId: string
  seats?: number | null
  customer?: { id?: string | null, externalId?: string | null } | null
  metadata?: Record<string, unknown> | null
}) {
  return {
    id: d.id,
    status: d.status,
    current_period_end: d.currentPeriodEnd ? new Date(d.currentPeriodEnd).toISOString() : null,
    cancel_at_period_end: d.cancelAtPeriodEnd ?? false,
    modified_at: d.modifiedAt ? new Date(d.modifiedAt).toISOString() : null,
    product_id: d.productId,
    seats: d.seats ?? 1,
    customer: { id: d.customer?.id ?? null, external_id: d.customer?.externalId ?? null },
    metadata: d.metadata ?? null,
  }
}

export default defineServerAuth(({ runtimeConfig }) => {
  const baseURL = runtimeConfig.public?.siteUrl || 'http://localhost:3000'

  const polarClient = new Polar({
    accessToken: runtimeConfig.polarAccessToken,
    // Sandbox mode uses a Polar sandbox token; production uses a production token —
    // the server mode must match the token or Polar returns 401 invalid_token.
    server: runtimeConfig.sandboxMode ? 'sandbox' : 'production',
  })

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

    trustedOrigins: clientListOrigins,

    databaseHooks: {
      session: {
        create: {
          // Fires when a verified user establishes a session = "first verified sign-in".
          after: async (session) => {
            // never block sign-in
            try {
              await orgEnsurePersonal(session.userId)
            }
            catch (error) {
              console.error('[auth] ensurePersonalOrg failed', session.userId, error)
            }
          },
        },
      },
      user: {
        // better-auth admin deleteUser → clean up D1 rows (no FK cascade at runtime).
        delete: {
          before: async (user) => {
            try {
              await subscriptionClearForUser(user.id)
            }
            catch (error) {
              console.error('[auth] subscriptionClearForUser failed', user.id, error)
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
          return claimsResolve(user.id, clientId)
        },
        // userinfo hook gets the validated access-token payload; azp = requesting client.
        // Entitlements + abilities ride into userinfo ONLY (re-resolved live), never the immutable id_token.
        async customUserInfoClaims({ user, jwt }) {
          const clientId = (jwt as { azp?: string, client_id?: string } | undefined)?.azp
            ?? (jwt as { client_id?: string } | undefined)?.client_id ?? null
          // Resolve org/roles ONCE; derive abilities from the SAME snapshot (no TOCTOU — R6).
          const claims = await claimsResolve(user.id, clientId)
          const [organizations, entitlement, abilities] = await Promise.all([
            claimsResolveAll(user.id, clientId),
            entitlementsResolve(user.id, clientId),
            abilitiesResolve(user.id, clientId, claims.roles),
          ])
          return {
            ...claims,
            organizations,
            abilities,
            role: (user as { role?: string | null }).role ?? null,
            entitlement,
          }
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
              await accessGrantAll(org.id, user.id)
            }
            catch (error) {
              console.error('[auth] accessGrantAll (afterCreateOrganization) failed', org.id, error)
            }
          },
          // D1 has no FK cascade — explicitly clean up access rows (AC6).
          afterRemoveMember: async ({ member: removed, organization: org }) => {
            try {
              await accessClearMember(org.id, removed.userId)
            }
            catch (error) {
              console.error('[auth] accessClearMember (afterRemoveMember) failed', org.id, removed.userId, error)
            }
          },
          beforeDeleteOrganization: async ({ organization: org }) => {
            try {
              await accessClearOrg(org.id)
            }
            catch (error) {
              console.error('[auth] accessClearOrg (beforeDeleteOrganization) failed', org.id, error)
            }
          },
        },
      }),
      apiKey({
        enableSessionForAPIKeys: true,
      }),
      openAPI(),
      polar({
        client: polarClient,
        // Disabled in sandbox mode (NUXT_SANDBOX_MODE) so test email domains
        // (example.com, mailinator.com …) don't hit Polar's MX-record validation.
        createCustomerOnSignUp: !runtimeConfig.sandboxMode,
        // Bind the Polar customer to our user id so webhooks resolve back to a user.
        // user.id may be undefined in onBeforeUserCreate (id is assigned by adapter.create).
        // Only include metadata.userId when it is a non-empty string; the onAfterUserCreate
        // hook will update externalId once the user is persisted.
        getCustomerCreateParams: async ({ user }) => (user.id ? { metadata: { userId: user.id } } : {}),
        use: [
          checkout({
            // No static product list: checkout is per-product — the UI passes the
            // Polar product id resolved at runtime (services/polar.ts).
            successUrl: `${baseURL}/?checkout_id={CHECKOUT_ID}`,
            authenticatedUsersOnly: true,
          }),
          portal(),
          usage(),
          webhooks({
            // prod: NUXT_POLAR_WEBHOOK_SECRET; dev: auto-provisioned via the global bridge.
            secret: runtimeConfig.polarWebhookSecret || getDevWebhookSecret() || '',
            onSubscriptionCreated: p => subscriptionUpsertFromPolar(polarSubToInput(p.data)),
            onSubscriptionUpdated: p => subscriptionUpsertFromPolar(polarSubToInput(p.data)),
            onSubscriptionActive: p => subscriptionUpsertFromPolar(polarSubToInput(p.data)),
            onSubscriptionCanceled: p => subscriptionUpsertFromPolar(polarSubToInput(p.data)),
            onSubscriptionRevoked: p => subscriptionUpsertFromPolar(polarSubToInput(p.data)),
            onSubscriptionUncanceled: p => subscriptionUpsertFromPolar(polarSubToInput(p.data)),
          }),
        ],
      }),
    ],
  }
})
