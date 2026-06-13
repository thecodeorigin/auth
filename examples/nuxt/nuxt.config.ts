export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  modules: ['nuxt-oidc-auth'],
  oidc: {
    providers: {
      oidc: {
        clientId: process.env.OIDC_CLIENT_ID!,
        clientSecret: process.env.OIDC_CLIENT_SECRET!,
        redirectUri: 'http://localhost:3003/auth/oidc/callback',
        // openIdConfiguration discovery URL — must match the IdP's /api/auth mount.
        openIdConfiguration: 'http://localhost:3000/api/auth/.well-known/openid-configuration',
        scope: ['openid', 'profile', 'email'],
        pkce: true,
        state: true,
        nonce: true,
      },
    },
  },
})
