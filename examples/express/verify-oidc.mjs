// Deterministic OIDC Authorization-Code + PKCE loop against the IdP, no browser.
// Proves Phase-1 acceptance: an issued id_token is RS256 with a kid present in JWKS.
import crypto from 'node:crypto'

// Targets localhost by default; override via env to verify the deployed Worker:
//   IDP=https://id.thecodeorigin.com/api/auth CLIENT_SECRET=... node verify-oidc.mjs
const IDP = process.env.IDP || 'http://localhost:3000/api/auth'
const CLIENT_ID = process.env.CLIENT_ID || 'express-app'
const CLIENT_SECRET = process.env.CLIENT_SECRET || 'TMIt15nC/2R3oj+6BSvl3t8nghFACqo7'
const REDIRECT_URI = process.env.REDIRECT_URI || 'http://localhost:3001/callback'
const EMAIL = process.env.EMAIL || 'alice@example.com'
const PASSWORD = process.env.PASSWORD || 'Passw0rd!'

const b64url = buf => buf.toString('base64url')

function parseSetCookie(res) {
  // node fetch exposes combined cookies via getSetCookie()
  const cookies = res.headers.getSetCookie?.() ?? []
  return cookies.map(c => c.split(';')[0]).join('; ')
}

// 1. Sign in to obtain the IdP session cookie.
const ORIGIN = new URL(IDP).origin
const signInRes = await fetch(`${IDP}/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'origin': ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!signInRes.ok)
  throw new Error(`sign-in failed: ${signInRes.status} ${await signInRes.text()}`)
const cookie = parseSetCookie(signInRes)
if (!cookie)
  throw new Error('no session cookie returned from sign-in')
console.log('1. signed in, session cookie acquired')

// 2. PKCE.
const verifier = b64url(crypto.randomBytes(32))
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
const state = b64url(crypto.randomBytes(16))

// 3. Authorize (carry session cookie), expect a 302 redirect to REDIRECT_URI?code=...
const authUrl = new URL(`${IDP}/oauth2/authorize`)
authUrl.search = new URLSearchParams({
  response_type: 'code',
  client_id: CLIENT_ID,
  redirect_uri: REDIRECT_URI,
  scope: 'openid profile email',
  state,
  code_challenge: challenge,
  code_challenge_method: 'S256',
}).toString()

const authRes = await fetch(authUrl, { headers: { cookie, origin: ORIGIN }, redirect: 'manual' })
// better-auth returns either a 302 (Location header) or, for fetch/API callers,
// a 200 JSON body { redirect: true, url }. Handle both.
let location = authRes.headers.get('location')
if (!location) {
  const body = await authRes.clone().json().catch(() => null)
  location = body?.url ?? null
}
console.log(`2. authorize -> HTTP ${authRes.status}, location: ${location}`)
if (!location)
  throw new Error(`no redirect from authorize: ${authRes.status} ${await authRes.text()}`)
const code = new URL(location).searchParams.get('code')
if (!code)
  throw new Error(`no code in redirect: ${location}`)
console.log('3. authorization code received')

// 4. Token exchange (client_secret_basic + PKCE verifier).
const basic = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
const tokenRes = await fetch(`${IDP}/oauth2/token`, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'authorization': `Basic ${basic}`,
  },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  }).toString(),
})
const tokenText = await tokenRes.text()
console.log(`   token endpoint -> HTTP ${tokenRes.status}, content-type: ${tokenRes.headers.get('content-type')}`)
if (!tokenRes.ok)
  throw new Error(`token exchange failed: ${tokenRes.status} ${tokenText}`)
const tokenBody = JSON.parse(tokenText)
console.log('4. token response keys:', Object.keys(tokenBody).join(', '))

const idToken = tokenBody.id_token
if (!idToken)
  throw new Error('no id_token in token response')
const [headerB64, payloadB64] = idToken.split('.')
const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString())
const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString())
console.log('5. id_token header:', JSON.stringify(header))
console.log('   id_token payload:', JSON.stringify({ iss: payload.iss, aud: payload.aud, sub: payload.sub, email: payload.email, org: payload.org, roles: payload.roles }))

// 6. Assert RS256 + kid present in JWKS.
const jwks = await (await fetch(`${IDP}/jwks`)).json()
const kids = (jwks.keys ?? []).map(k => k.kid)
const ok = header.alg === 'RS256' && header.kid && kids.includes(header.kid)
console.log(`6. JWKS kids: ${JSON.stringify(kids)}`)
console.log(`   issuer matches discovery: ${payload.iss === IDP}`)

if (!ok)
  throw new Error(`ASSERTION FAILED: alg=${header.alg} kid=${header.kid} in JWKS=${kids.includes(header.kid)}`)
if (payload.iss !== IDP)
  throw new Error(`ASSERTION FAILED: issuer ${payload.iss} !== ${IDP}`)
console.log('\n✅ PASS: id_token is RS256, kid present in JWKS, issuer aligned to /api/auth')
