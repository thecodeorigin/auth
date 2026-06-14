// Authorization proof (Phase 2): the OIDC id_token carries the authorization context for the
// REQUESTING application, selected deterministically by grant-quality tiering (fixes SEC-01).
//
// Fixture (seed:authz-fixtures): alice is a `viewer` in Org B, scoped to the NordVPN client
// ONLY (a tier-0 exact access grant). Her auto-provisioned personal org holds a '*' grant.
//
//   NordVPN flow   → org = Org B,        roles = viewer   (tier-0 exact beats personal '*')
//   Nord Web flow  → org = personal org, (Org B excluded: no Nord Web row, default-closed)
//
// Run against local (default) or prod via IDP=... env.
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const IDP = process.env.IDP || 'http://localhost:3000/api/auth'
const ORIGIN = new URL(IDP).origin
const EMAIL = process.env.EMAIL || 'alice@seed.local'
const PASSWORD = process.env.PASSWORD || 'Passw0rd!'

const ALL = JSON.parse(readFileSync(new URL('./.clients.json', import.meta.url), 'utf8'))
const byName = name => ALL.find(c => c.name === name)
const toClient = c => ({ id: c.clientId, secret: c.clientSecret ?? null, redirect: c.redirectUris[0], public: Boolean(c.public) })
const nordvpn = toClient(byName('NordVPN'))
const nordweb = toClient(byName('Nord Web'))
if (!nordvpn || !nordweb)
  throw new Error('NordVPN / Nord Web not found in .clients.json — run seed:idp first')

const b64url = b => b.toString('base64url')
const setCookie = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')
const decode = jwt => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString())

// Sign in ONCE (also provisions alice's personal org via the verified-session hook).
const si = await fetch(`${IDP}/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'origin': ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!si.ok)
  throw new Error(`sign-in failed: ${si.status} ${await si.text()}`)
const cookie = setCookie(si)

// Apply the Phase-2 fixture (idempotent). Local only — skip if pointing at prod.
let fx = {}
if (ORIGIN.includes('localhost')) {
  const res = await fetch(`${ORIGIN}/_nitro/tasks/seed:authz-fixtures`, { method: 'POST' })
  const json = await res.json().catch(() => ({}))
  fx = json && typeof json.result === 'object' ? json.result : json
  if (!fx.orgB || !fx.personalOrg)
    throw new Error(`fixture task did not return ids: ${JSON.stringify(json)}`)
}
console.log(`Signed in as ${EMAIL}. Org B = ${fx.orgB}, personal = ${fx.personalOrg}\n`)

async function idTokenFor(c) {
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
  const ares = await fetch(url, { headers: { cookie, origin: ORIGIN }, redirect: 'manual' })
  let loc = ares.headers.get('location')
  if (!loc)
    loc = (await ares.clone().json().catch(() => ({})))?.url
  if (!loc || loc.includes('/sign-in'))
    throw new Error(`no authorize redirect for ${c.id}: ${ares.status}`)
  const code = new URL(loc).searchParams.get('code')

  const headers = { 'content-type': 'application/x-www-form-urlencoded' }
  const body = { grant_type: 'authorization_code', code, redirect_uri: c.redirect, code_verifier: verifier }
  if (c.public)
    body.client_id = c.id
  else headers.authorization = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`
  const tres = await fetch(`${IDP}/oauth2/token`, { method: 'POST', headers, body: new URLSearchParams(body).toString() })
  if (!tres.ok)
    throw new Error(`token exchange failed for ${c.id}: ${tres.status} ${await tres.text()}`)
  return decode(JSON.parse(await tres.text()).id_token)
}

let failures = 0
function assert(label, actual, expected) {
  const ok = actual === expected
  console.log(`  ${ok ? '✓' : '✗'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` — EXPECTED ${JSON.stringify(expected)}`}`)
  if (!ok)
    failures++
}

// AC3: NordVPN → Org B, viewer (tier-0 exact grant wins over personal '*').
const nordvpnClaims = await idTokenFor(nordvpn)
console.log(`NordVPN id_token  → org=${nordvpnClaims.org} roles=${nordvpnClaims.roles} personal=${nordvpnClaims.personal}`)
assert('NordVPN org is Org B', nordvpnClaims.org, fx.orgB)
assert('NordVPN roles is viewer', nordvpnClaims.roles, 'viewer')

// AC3/AC4: Nord Web → personal org (Org B excluded: no Nord Web scope row, default-closed).
const nordwebClaims = await idTokenFor(nordweb)
console.log(`Nord Web id_token → org=${nordwebClaims.org} roles=${nordwebClaims.roles} personal=${nordwebClaims.personal}`)
assert('Nord Web org is personal org', nordwebClaims.org, fx.personalOrg)
assert('Nord Web org is NOT Org B', nordwebClaims.org === fx.orgB, false)
assert('Nord Web personal flag', nordwebClaims.personal, true)

if (failures) {
  console.error(`\n❌ AUTHZ FAIL: ${failures} assertion(s) failed.`)
  process.exit(1)
}
console.log('\n✅ AUTHZ PROVEN: id_token org/roles are scoped to the requesting app; default-closed deny works.')
