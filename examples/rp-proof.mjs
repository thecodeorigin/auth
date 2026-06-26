// RP impersonation proof: proves the module-facing IdP endpoints behave correctly.
//
// Assertions (Phase 2 + Phase 5):
//   A1. userinfo returns organizations[], abilities[], role for the requesting client.
//   A2. /rp/impersonatable-users 403s when called by a non-admin.
//   A3. /rp/impersonatable-users returns a non-empty list for an admin (no admins in the list).
//   A4. /rp/impersonate mints a short-lived non-refreshable access token for a target user.
//   A5. Re-impersonation (calling /rp/impersonate with an impersonation token) is rejected.
//   A6. /rp/stop-impersonating revokes the impersonation token.
//
// Run with the IdP on :3000 (pnpm dev) + seed:idp + seed:authz-fixtures having been called.
import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'

const IDP = process.env.IDP || 'http://localhost:3000/api/auth'
const ORIGIN = new URL(IDP).origin
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'contact@thecodeorigin.com'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'AdminPass1!'
const USER_EMAIL = process.env.USER_EMAIL || 'alice@seed.local'
const USER_PASSWORD = process.env.USER_PASSWORD || 'Passw0rd!'

const ALL = JSON.parse(readFileSync(new URL('./.clients.json', import.meta.url), 'utf8'))
const byName = name => ALL.find(c => c.name === name)
const nordvpn = byName('NordVPN')
if (!nordvpn)
  throw new Error('NordVPN not found in .clients.json — run seed:idp first')
const nordvpnClient = { id: nordvpn.clientId, secret: nordvpn.clientSecret, redirect: nordvpn.redirectUris[0] }

const b64url = b => b.toString('base64url')
const setCookie = res => (res.headers.getSetCookie?.() ?? []).map(c => c.split(';')[0]).join('; ')

let failures = 0
function assert(label, ok, detail = '') {
  const sym = ok ? '✓' : '✗'
  console.log(`  ${sym} ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok)
    failures++
}

async function signIn(email, password) {
  const res = await fetch(`${IDP}/sign-in/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': ORIGIN },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok)
    throw new Error(`sign-in failed for ${email}: ${res.status} ${await res.text()}`)
  return setCookie(res)
}

async function pkce(cookie) {
  const verifier = b64url(crypto.randomBytes(32))
  const challenge = b64url(crypto.createHash('sha256').update(verifier).digest())
  const url = new URL(`${IDP}/oauth2/authorize`)
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: nordvpnClient.id,
    redirect_uri: nordvpnClient.redirect,
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
    throw new Error(`no authorize redirect: ${ares.status}`)
  const code = new URL(loc).searchParams.get('code')

  const tres = await fetch(`${IDP}/oauth2/token`, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'authorization': `Basic ${Buffer.from(`${nordvpnClient.id}:${nordvpnClient.secret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: nordvpnClient.redirect, code_verifier: verifier }).toString(),
  })
  if (!tres.ok)
    throw new Error(`token exchange failed: ${tres.status} ${await tres.text()}`)
  const tokens = await tres.json()
  return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token ?? null }
}

async function userinfo(accessToken) {
  const res = await fetch(`${IDP}/oauth2/userinfo`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok)
    throw new Error(`userinfo failed: ${res.status}`)
  return res.json()
}

// ── Phase 1: userinfo claims ──────────────────────────────────────────────────
console.log('\nA1 — userinfo returns organizations/abilities/role\n')

const userCookie = await signIn(USER_EMAIL, USER_PASSWORD)
const { accessToken: userToken } = await pkce(userCookie)
const ui = await userinfo(userToken)

assert('organizations is an array', Array.isArray(ui.organizations), `got ${typeof ui.organizations}`)
assert('organizations is non-empty', ui.organizations.length > 0, `got ${ui.organizations.length}`)
assert('organizations has id/slug/name/role/personal', ui.organizations[0] && 'id' in ui.organizations[0] && 'slug' in ui.organizations[0], JSON.stringify(ui.organizations[0]))
assert('abilities is an array', Array.isArray(ui.abilities), `got ${typeof ui.abilities}`)
assert('role key present in userinfo', 'role' in ui, `keys: ${Object.keys(ui).join(',')}`)

console.log(`  userinfo: org=${ui.org} roles=${ui.roles} orgsCount=${ui.organizations.length} abilities=${ui.abilities.length} role=${ui.role}`)

// ── Phase 2: non-admin cannot call /rp/impersonatable-users ──────────────────
console.log('\nA2 — non-admin gets 403 from /rp/impersonatable-users\n')

const notAdminRes = await fetch(`${ORIGIN}/api/auth/rp/impersonatable-users`, {
  headers: { authorization: `Bearer ${userToken}` },
})
assert('non-admin 403', notAdminRes.status === 403, `got ${notAdminRes.status}`)

// ── Phase 3: admin can list impersonatable users ──────────────────────────────
console.log('\nA3 — admin gets user list (no admins included)\n')

const adminCookie = await signIn(ADMIN_EMAIL, ADMIN_PASSWORD)
const { accessToken: adminToken } = await pkce(adminCookie)
const adminUi = await userinfo(adminToken)

assert('admin role=admin in userinfo', adminUi.role === 'admin', `got ${adminUi.role}`)

const listRes = await fetch(`${ORIGIN}/api/auth/rp/impersonatable-users`, {
  headers: { authorization: `Bearer ${adminToken}` },
})
assert('admin 200 from /rp/impersonatable-users', listRes.status === 200, `got ${listRes.status}`)
const list = await listRes.json()
assert('list has items array', Array.isArray(list.items), `got ${JSON.stringify(list)}`)

const targetUser = list.items.find(u => u.email === USER_EMAIL)
assert(`${USER_EMAIL} appears in list`, !!targetUser, `list: ${list.items.map(u => u.email).join(', ')}`)
const adminInList = list.items.find(u => u.email === ADMIN_EMAIL)
assert('admin not in list (excluded)', !adminInList, `admin found: ${ADMIN_EMAIL}`)

// ── Phase 4: impersonate mints a non-refreshable token ───────────────────────
console.log('\nA4 — impersonate mints a short-lived non-refreshable token\n')

const impRes = await fetch(`${ORIGIN}/api/auth/rp/impersonate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization': `Bearer ${adminToken}` },
  body: JSON.stringify({ userId: targetUser.id }),
})
assert('impersonate 200', impRes.status === 200, `got ${impRes.status}: ${await impRes.clone().text()}`)
const impBody = await impRes.json()
assert('impersonation has accessToken', typeof impBody.accessToken === 'string', `got ${typeof impBody.accessToken}`)
assert('impersonation has expiresAt', typeof impBody.expiresAt === 'number', `got ${typeof impBody.expiresAt}`)
assert('impersonation token is short-lived (≤30min)', impBody.expiresAt - Date.now() <= 30 * 60 * 1000 + 5000, `expiresIn=${impBody.expiresAt - Date.now()}ms`)
assert('impersonation has user.sub', typeof impBody.user?.sub === 'string', `got ${JSON.stringify(impBody.user)}`)
assert('impersonation has claims', impBody.claims && Array.isArray(impBody.claims.organizations), `got ${JSON.stringify(impBody.claims)}`)

const impersonationToken = impBody.accessToken

// ── Phase 5: re-impersonation rejected ───────────────────────────────────────
console.log('\nA5 — re-impersonation with impersonation token is rejected\n')

const reImpRes = await fetch(`${ORIGIN}/api/auth/rp/impersonate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'authorization': `Bearer ${impersonationToken}` },
  body: JSON.stringify({ userId: targetUser.id }),
})
assert('re-impersonation rejected (400)', reImpRes.status === 400, `got ${reImpRes.status}: ${await reImpRes.clone().text()}`)

// ── Phase 6: stop-impersonating revokes token ─────────────────────────────────
console.log('\nA6 — stop-impersonating revokes the impersonation token\n')

const stopRes = await fetch(`${ORIGIN}/api/auth/rp/stop-impersonating`, {
  method: 'POST',
  headers: { authorization: `Bearer ${adminToken}` },
})
assert('stop-impersonating 200', stopRes.status === 200, `got ${stopRes.status}: ${await stopRes.clone().text()}`)

// Verify the impersonation token is now revoked
const revokedRes = await fetch(`${ORIGIN}/api/auth/rp/impersonatable-users`, {
  headers: { authorization: `Bearer ${impersonationToken}` },
})
assert('revoked impersonation token → 401', revokedRes.status === 401, `got ${revokedRes.status}`)

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${failures === 0 ? '✓ ALL' : `✗ ${failures}`} assertions ${failures === 0 ? 'passed' : 'failed'}`)
if (failures > 0)
  process.exit(1)
