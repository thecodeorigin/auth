import NextAuth from 'next-auth'

// Custom OIDC provider pointing at the IdP. `issuer` MUST equal the IdP's
// jwt.issuer (http://localhost:3000/api/auth) or next-auth throws issuer-mismatch.
export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    {
      id: 'betterauth',
      name: 'Better Auth',
      type: 'oidc',
      issuer: process.env.OIDC_ISSUER,
      wellKnown: `${process.env.OIDC_ISSUER}/.well-known/openid-configuration`,
      clientId: process.env.OIDC_CLIENT_ID,
      clientSecret: process.env.OIDC_CLIENT_SECRET,
      authorization: { params: { scope: 'openid profile email' } },
      checks: ['pkce', 'state'],
    },
  ],
})
