// Entitlement proof: the OIDC userinfo endpoint returns the user's LIVE subscription
// entitlement for the requesting client. NordPass client → active; NordVPN → expired.
// Reuses the seeded subscriptions (seed:subscriptions) for alice@seed.local.
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const IDP = process.env.IDP || 'http://localhost:3000/api/auth'
const ORIGIN = new URL(IDP).origin
const EMAIL = process.env.EMAIL || 'alice@seed.local'
const PASSWORD = process.env.PASSWORD || 'Passw0rd!'

const ALL = JSON.parse(readFileSync(new URL('./.clients.json', import.meta.url), 'utf8'))
const byName = n => ALL.find(c => c.name === n)
const toClient = c => ({ id: c.clientId, secret: c.clientSecret ?? null, redirect: c.redirectUris[0], public: Boolean(c.public) })
const nordpass = toClient(byName('NordPass'))
const nordvpn = toClient(byName('NordVPN'))

const b64url = b => b.toString('base64url')
const setCookie = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

const si = await fetch(`${IDP}/sign-in/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: ORIGIN },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
})
if (!si.ok)
  throw new Error(`sign-in failed: ${si.status}`)
const cookie = setCookie(si)

// Ensure the demo subscriptions exist (idempotent, local only).
if (ORIGIN.includes('localhost'))
  await fetch(`${ORIGIN}/_nitro/tasks/seed:subscriptions`, { method: 'POST' })

async function accessTokenFor(c) {
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
  const loc = ares.headers.get('location') || (await ares.clone().json().catch(() => ({})))?.url
  const code = new URL(loc).searchParams.get('code')
  const headers = { 'content-type': 'application/x-www-form-urlencoded' }
  const body = { grant_type: 'authorization_code', code, redirect_uri: c.redirect, code_verifier: verifier }
  if (c.public)
    body.client_id = c.id
  else headers.authorization = `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`
  const tres = await fetch(`${IDP}/oauth2/token`, { method: 'POST', headers, body: new URLSearchParams(body).toString() })
  if (!tres.ok)
    throw new Error(`token failed for ${c.id}: ${tres.status} ${await tres.text()}`)
  return JSON.parse(await tres.text()).access_token
}

async function userinfo(token) {
  const res = await fetch(`${IDP}/oauth2/userinfo`, { headers: { authorization: `Bearer ${token}` } })
  if (!res.ok)
    throw new Error(`userinfo failed: ${res.status} ${await res.text()}`)
  return res.json()
}

let failures = 0
const assert = (label, actual, expected) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected)
  console.log(`  ${ok ? '✓' : '✗'} ${label}: got ${JSON.stringify(actual)}${ok ? '' : ` — EXPECTED ${JSON.stringify(expected)}`}`)
  if (!ok)
    failures++
}

const npInfo = await userinfo(await accessTokenFor(nordpass))
console.log(`NordPass userinfo.entitlement → ${JSON.stringify(npInfo.entitlement)}`)
assert('NordPass entitlement product', npInfo.entitlement?.product, 'nordpass')
assert('NordPass entitlement active', npInfo.entitlement?.active, true)

const nvInfo = await userinfo(await accessTokenFor(nordvpn))
console.log(`NordVPN userinfo.entitlement → ${JSON.stringify(nvInfo.entitlement)}`)
assert('NordVPN entitlement product', nvInfo.entitlement?.product, 'nordvpn')
assert('NordVPN entitlement active (expired sub)', nvInfo.entitlement?.active, false)

if (failures) {
  console.error(`\n❌ ENTITLEMENT FAIL: ${failures} assertion(s).`)
  process.exit(1)
}
console.log('\n✅ ENTITLEMENT PROVEN: userinfo carries live per-client subscription entitlement.')
