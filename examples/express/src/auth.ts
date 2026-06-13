import * as client from 'openid-client'

// Discover the IdP and configure this confidential client. openid-client v6
// treats a string 3rd arg as the client_secret and defaults to
// client_secret_basic auth at the token endpoint — which matches what the IdP
// advertises in token_endpoint_auth_methods_supported.
const issuer = new URL(process.env.OIDC_ISSUER!) // http://localhost:3000/api/auth
const insecure = issuer.protocol === 'http:'

export const config = await client.discovery(
  issuer,
  process.env.OIDC_CLIENT_ID!, // express-app
  process.env.OIDC_CLIENT_SECRET!, // NUXT_OIDC_EXPRESS_SECRET value
  undefined,
  // openid-client v6 enforces HTTPS; allow plain HTTP only for localhost dev.
  insecure ? { execute: [client.allowInsecureRequests] } : undefined,
)

export const redirect_uri = 'http://localhost:3001/callback'
