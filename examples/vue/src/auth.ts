import * as oauth from 'oauth4webapi'

// Public OIDC client (PKCE-only, no secret) against the IdP. Discovery + all token
// calls are cross-origin to http://localhost:3000 — that origin is in the IdP's
// trustedOrigins so the browser's CORS preflight passes.
const issuer = new URL(import.meta.env.VITE_OIDC_ISSUER || 'http://localhost:3000/api/auth')
oauth.allowInsecureRequests // (HTTP localhost is allowed by default in oauth4webapi)

const as = await oauth.processDiscoveryResponse(
  issuer,
  await oauth.discoveryRequest(issuer, { algorithm: 'oidc' }),
)

const client: oauth.Client = { client_id: 'vue-spa' }
const clientAuth = oauth.None()
const redirect_uri = 'http://localhost:3004/callback'

export async function login() {
  const code_verifier = oauth.generateRandomCodeVerifier()
  const code_challenge = await oauth.calculatePKCECodeChallenge(code_verifier)
  const state = oauth.generateRandomState()
  sessionStorage.setItem('pkce', code_verifier)
  sessionStorage.setItem('state', state)
  const url = new URL(as.authorization_endpoint!)
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri,
    response_type: 'code',
    scope: 'openid profile email',
    code_challenge,
    code_challenge_method: 'S256',
    state,
  }).toString()
  location.href = url.href
}

export async function handleCallback() {
  const params = oauth.validateAuthResponse(as, client, new URL(location.href), sessionStorage.getItem('state')!)
  const res = await oauth.authorizationCodeGrantRequest(
    as,
    client,
    clientAuth,
    params,
    redirect_uri,
    sessionStorage.getItem('pkce')!,
  )
  const tokens = await oauth.processAuthorizationCodeResponse(as, client, res)
  const sub = oauth.getValidatedIdTokenClaims(tokens)!.sub
  const ui = await oauth.processUserInfoResponse(as, client, sub, await oauth.userInfoRequest(as, client, tokens.access_token))
  return ui
}
