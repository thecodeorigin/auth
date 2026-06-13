// SSO proof: a SINGLE IdP session authenticates ALL registered clients without a
// second credential prompt — and the public Vue SPA works PKCE-only (no secret)
// while being rejected if it omits the code_verifier.
//
// This is the defining acceptance of the whole project (the brief's "log in once,
// reach all apps"). Run against local (default) or prod via IDP=... env.
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const IDP = process.env.IDP || 'http://localhost:3000/api/auth'
const ORIGIN = new URL(IDP).origin
const EMAIL = process.env.EMAIL || 'alice@seed.local'
const PASSWORD = process.env.PASSWORD || 'Passw0rd!'

const CLIENTS = JSON.parse(readFileSync(new URL('./.clients.json', import.meta.url), 'utf8')).map(c => ({
  id: c.clientId,
  secret: c.clientSecret ?? null,
  redirect: c.redirectUris[0],
  public: Boolean(c.public),
}))

const b64url = b => b.toString('base64url')
const setCookie = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

// Sign in ONCE — the shared IdP session every client will reuse.
const si = await fetch(`${IDP}/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'origin': ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!si.ok)
  throw new Error(`sign-in failed: ${si.status} ${await si.text()}`)
const cookie = setCookie(si)
console.log(`Signed in ONCE as ${EMAIL}. Now authorizing ${CLIENTS.length} clients with that single session:\n`)

async function authorize(c) {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const url = new URL(`${IDP}/oauth2/authorize`)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: c.id,
    redirect_uri: c.redirect,
    scope: 'openid profile email',
    state: b64url(crypto.randomBytes(8)),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  }).toString()
  const res = await fetch(url, { headers: { cookie, origin: ORIGIN }, redirect: 'manual' })
  let loc = res.headers.get('location')
  if (!loc)
    loc = (await res.clone().json().catch(() => ({})))?.url
  if (!loc)
    throw new Error(`no redirect (re-login required?) for ${c.id}: ${res.status}`)
  if (loc.includes('/sign-in'))
    throw new Error(`SSO FAIL: ${c.id} was sent to /sign-in (re-login)`)
  const code = new URL(loc).searchParams.get('code')
  if (!code)
    throw new Error(`no code for ${c.id}: ${loc}`)
  return { code, verifier }
}

async function exchange(c, code, verifier, { omitVerifier = false } = {}) {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' }
  const body = { grant_type: 'authorization_code', code, redirect_uri: c.redirect }
  if (c.public)
    body.client_id = c.id // public client: token_endpoint_auth_method=none → client_id in body
  else headers.authorization = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`
  if (!omitVerifier)
    body.code_verifier = verifier
  const res = await fetch(`${IDP}/oauth2/token`, { method: 'POST', headers, body: new URLSearchParams(body).toString() })
  return { ok: res.ok, status: res.status, body: await res.text() }
}

let pass = 0
let firstIdTokenClaims = null
for (const c of CLIENTS) {
  const { code, verifier } = await authorize(c)
  const t = await exchange(c, code, verifier)
  if (!t.ok)
    throw new Error(`token exchange failed for ${c.id}: ${t.status} ${t.body}`)
  const idt = JSON.parse(t.body).id_token
  const alg = JSON.parse(Buffer.from(idt.split('.')[0], 'base64url').toString()).alg
  if (!firstIdTokenClaims)
    firstIdTokenClaims = JSON.parse(Buffer.from(idt.split('.')[1], 'base64url').toString())
  console.log(`  ✓ ${c.id.padEnd(12)} ${c.public ? '(public/PKCE)' : '(confidential)'} → code+token issued, id_token alg=${alg}, NO re-login`)
  pass++
}

// Phase-1 probe: the seeded clients must carry metadata.clientId so the id_token hook can scope claims.
// (Hard assertion of the hook payload — org/roles scoped to the requesting client — is added in
// examples/authz-proof.mjs in Phase 2.) For now, soft-check the issuer produced a well-formed id_token.
if (!firstIdTokenClaims?.sub)
  throw new Error(`PHASE-1 PROBE FAIL: id_token missing 'sub' claim: ${JSON.stringify(firstIdTokenClaims)}`)

// Public-client PKCE enforcement: vue-spa without code_verifier must be rejected.
const spa = CLIENTS.find(c => c.public)
const { code } = await authorize(spa)
const bad = await exchange(spa, code, null, { omitVerifier: true })
if (bad.ok)
  throw new Error('SECURITY FAIL: public client accepted token without code_verifier')
console.log(`  ✓ ${spa.id.padEnd(12)} correctly REJECTED without code_verifier (HTTP ${bad.status})`)

console.log(`\n✅ SSO PROVEN: 1 sign-in → ${pass} clients authorized without re-entering credentials; public client is PKCE-enforced.`)
